/* ============================================================================
 * HydroManifold — Analysis & Intelligence (the "AI" layer)
 * ----------------------------------------------------------------------------
 * Decision logic on top of the live telemetry:
 *   anomalies()        statistical outlier / "unpredictable variable" detection
 *   maintenance()      predictive maintenance (bearing wear, calibration due)
 *   leaks()            leak/break localization + estimated loss rate
 *   outages()          outage propagation: affected section, population, valves
 *   loadBalance()      source/pump capacity vs demand, failover headroom
 *   recovery()         catastrophic-recovery / failsafe action plans
 *
 * All pure functions over the Simulator state. Estimates are labelled as such.
 * ========================================================================== */
(function (root) {
  'use strict';
  const round = Math.round;

  // How much of the served population a failure at this station type knocks out.
  const OUTAGE_IMPACT = { source: 0.35, treatment: 0.40, pump: 0.12, storage: 0.18, prv: 0.06, distribution: 0.05, service: 0.002 };
  const ISO_VALVES = { source: 4, treatment: 6, pump: 3, storage: 4, prv: 2, distribution: 4, service: 1 };

  function activeFaults(st) {
    const f = st.faults; const out = [];
    if (f.break > 0.2) out.push('break');
    if (f.leak > 0.2) out.push('leak');
    if (f.freeze > 0.2) out.push('freeze');
    if (f.pumpTrip) out.push('pump_trip');
    if (f.qualityUpset > 0.2) out.push('quality');
    if (f.sensorFault) out.push('sensor');
    return out;
  }

  // ── Anomaly detection: reading far from the station's nominal expectation ──
  function anomalies(sim) {
    const out = [];
    for (const st of sim.stations) {
      const n = st.def.nominal;
      for (const mk of Object.keys(st.readings)) {
        const r = st.readings[mk]; if (!r) continue;
        const expected = expectedFor(mk, n, sim);
        if (expected == null || expected === 0) continue;
        const dev = (r.value - expected) / Math.abs(expected);
        if (Math.abs(dev) > 0.45) {
          out.push({ station: st.name, measure: mk, value: r.value, expected,
            pct: Math.round(dev * 100), msg: `${mk} ${dev > 0 ? '+' : ''}${Math.round(dev * 100)}% vs expected (${fmt(expected)})` });
        }
      }
    }
    return out.slice(0, 12);
  }
  function expectedFor(mk, n, sim) {
    switch (mk) {
      case 'pressure': return n.pressure;
      case 'flow': return (n.flow || 0) * (sim.demand || 1);
      case 'level': return n.level;
      case 'temperature': return 52;
      case 'turbidity': return n.turbidity;
      case 'chlorine': return n.chlorine;
      case 'vibration': return n.vibration;
      case 'current': return n.current;
      case 'leak': return n.leak;
      default: return null;
    }
  }

  // ── Predictive maintenance ──
  function maintenance(sim) {
    const out = [];
    for (const st of sim.stations) {
      const r = st.readings;
      if (r.vibration && st.def.nominal.vibration && r.vibration.value > st.def.nominal.vibration * 2.2) {
        out.push({ station: st.name, kind: 'bearing', sev: r.vibration.value > 0.4 ? 'alarm' : 'warning',
          msg: `Pump vibration ${r.vibration.value.toFixed(2)} in/s — bearing wear/cavitation; service before failure` });
      }
      // calibration overdue (monitor the monitors)
      for (const sid of st.def.sensors) {
        const sh = st.sensorHealth[sid], spec = (root.HM_SENSORS.SENSOR_CATALOG)[sid];
        if (spec && sh && sh.calAgeDays > spec.calDays) {
          out.push({ station: st.name, kind: 'calibration', sev: 'warning',
            msg: `${spec.name} calibration overdue (${Math.round(sh.calAgeDays)}d / ${spec.calDays}d)` });
          break;
        }
      }
    }
    return out.slice(0, 10);
  }

  // ── Leak / break localization ──
  function leaks(sim) {
    const out = [];
    for (const st of sim.stations) {
      const f = st.faults;
      if (f.break > 0.2 || f.leak > 0.2) {
        const sev = f.break > 0.2 ? 'break' : 'leak';
        const lossGpm = sev === 'break'
          ? round((st.def.nominal.flow || 200) * 2.0 * f.break)
          : round((st.def.nominal.flow || 200) * 0.18 * f.leak);
        out.push({ station: st.name, section: 'SEG-' + st.id.toUpperCase(), severity: sev,
          confidence: sev === 'break' ? 0.96 : 0.78,
          lossGpm, msg: `${sev === 'break' ? 'Main break' : 'Leak'} at ${st.name} — est. ${lossGpm} GPM loss${sev === 'leak' ? ' (acoustic + transient correlation)' : ''}` });
      }
    }
    return out;
  }

  // ── Outage propagation ──
  function outages(sim) {
    const P = sim.topology.totals.population || 0;
    const out = [];
    for (const st of sim.stations) {
      const fs = activeFaults(st);
      const critical = st.health.z < 0.2 || fs.includes('break') || fs.includes('pump_trip');
      if (!critical) continue;
      const impact = (OUTAGE_IMPACT[st.type] || 0.05);
      const people = round(P * impact);
      out.push({ station: st.name, type: st.type, section: 'SEG-' + st.id.toUpperCase(),
        affectedPeople: people, affectedPct: Math.round(impact * 100),
        valves: ISO_VALVES[st.type] || 2,
        cause: fs[0] || 'critical', msg: `${st.name}: ~${fmtCount(people)} people in outage area (est.) · isolate ${ISO_VALVES[st.type] || 2} valves` });
    }
    return out;
  }

  // ── Load balancing / source capacity ──
  function loadBalance(sim) {
    const sources = sim.stations.filter((s) => s.type === 'source' || s.type === 'pump');
    const online = sources.filter((s) => !s.faults.pumpTrip && s.health.z > 0.3);
    const totalCap = sim.topology.tier.comp.source ? (sim.topology.tier.comp.source + sim.topology.tier.comp.pump) : 1;
    const onlineFrac = sources.length ? online.length / sources.length : 1;
    const demandMul = sim.demand || 1;
    // headroom: capacity normally sized ~1.6× average; subtract demand & offline share
    const headroom = Math.max(0, 1.6 * onlineFrac - demandMul);
    let status = 'balanced', action = 'Nominal — sources balanced to demand.';
    if (onlineFrac < 1) { status = 'rebalancing'; action = `Source offline — load redistributed across ${online.length} of ${sources.length} stations.`; }
    if (headroom < 0.15) { status = 'strained'; action = 'Headroom low — stage standby pumps / draw storage / curtail non-critical demand.'; }
    if (headroom <= 0) { status = 'deficit'; action = 'Supply deficit — activate alternate supplier and reservoir reserves.'; }
    return { status, action, onlineSources: online.length, totalSources: sources.length, headroomPct: Math.round(headroom * 100), demandPct: Math.round(demandMul * 100) };
  }

  // ── Catastrophic recovery / failsafe planning ──
  function recovery(sim) {
    const plans = [];
    for (const st of sim.stations) {
      const fs = activeFaults(st);
      const lowP = st.readings.pressure && st.readings.pressure.value < 20;
      if (!(fs.includes('break') || fs.includes('pump_trip') || fs.includes('quality') || lowP || st.health.z < 0.18)) continue;
      const steps = [];
      if (fs.includes('break')) {
        steps.push({ t: 'ISOLATE', done: true, eta: '2 min', msg: `Auto-close ${ISO_VALVES[st.type] || 4} isolation valves around SEG-${st.id.toUpperCase()}` });
        steps.push({ t: 'REROUTE', done: true, eta: '5 min', msg: 'Open cross-tie from adjacent main / DMA to maintain pressure' });
      }
      if (fs.includes('pump_trip')) {
        steps.push({ t: 'FAILOVER', done: true, eta: '90 s', msg: 'Start standby pump / VFD ramp; transfer load' });
      }
      steps.push({ t: 'DRAW RESERVES', done: true, eta: 'live', msg: 'Supply affected zone from storage reserves while repairs proceed' });
      if (lowP || fs.includes('quality')) {
        steps.push({ t: 'ADVISORY', done: true, eta: 'issued', msg: lowP ? 'Pressure <20 psi — auto boil-water advisory (backflow/contamination risk)' : 'Quality upset — Do-Not-Use advisory to affected zone' });
      }
      steps.push({ t: 'DISPATCH', done: false, eta: '22 min', msg: 'Crew + equipment en route to SEG-' + st.id.toUpperCase() });
      steps.push({ t: 'RESTORE', done: false, eta: '3–6 h', msg: 'Repair, flush, bacteriological sample, return to service' });
      plans.push({ station: st.name, trigger: fs[0] || (lowP ? 'low pressure' : 'critical'), steps });
    }
    return plans.slice(0, 6);
  }

  function analyze(sim) {
    return {
      anomalies: anomalies(sim), maintenance: maintenance(sim), leaks: leaks(sim),
      outages: outages(sim), loadBalance: loadBalance(sim), recovery: recovery(sim)
    };
  }

  function fmt(v) { return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2); }
  function fmtCount(n) { return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? n.toLocaleString('en-US') : String(n); }

  root.HM_ANALYSIS = { analyze, anomalies, maintenance, leaks, outages, loadBalance, recovery, OUTAGE_IMPACT };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HM_ANALYSIS;
}(typeof window !== 'undefined' ? window : globalThis));
