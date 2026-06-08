/* ============================================================================
 * HydroManifold — Simulation Engine
 * ----------------------------------------------------------------------------
 * A functional, real-world-grounded water-system simulation. Per tick it
 * advances physics, evaluates every sensor against real alarm bands, folds the
 * results onto the z=x·y health manifold, runs predictive ETAs, and emits
 * alarms. Faults (leak, main break, freeze, pump trip, sensor fault, quality
 * upset) can be injected to watch the monitoring respond.
 *
 * Units are US water-industry conventional: psi, GPM, °F, %, NTU, mg/L.
 * ========================================================================== */
(function (root) {
  'use strict';

  const M = root.HM_MANIFOLD;
  const SENSORS = root.HM_SENSORS.SENSOR_CATALOG;

  // ── Real alarm bands per measured quantity ────────────────────────────────
  // good = normal operating window; warn/alarm/crit widen outward. Thresholds
  // reflect AWWA / Safe Drinking Water Act practice where regulated.
  const BANDS = {
    pressure:   { unit: 'psi',  good: [50, 90],  warnLo: 40, warnHi: 100, alarmLo: 30, alarmHi: 110, critLo: 20 },
    level:      { unit: '%',    good: [40, 100], warnLo: 30, alarmLo: 15, critLo: 8, min: true },
    temperature:{ unit: '°F',   good: [38, 75],  warnLo: 36, warnHi: 80,  alarmLo: 33, alarmHi: 90,  critLo: 32 },
    turbidity:  { unit: 'NTU',  good: [0, 0.3],  warnHi: 1.0, alarmHi: 5.0, max: true },
    ph:         { unit: 'pH',   good: [6.5, 8.5],warnLo: 6.0, warnHi: 9.0, alarmLo: 5.5, alarmHi: 9.5 },
    chlorine:   { unit: 'mg/L', good: [0.5, 4.0],warnLo: 0.3, warnHi: 4.0, alarmLo: 0.2, alarmHi: 5.0, critLo: 0.1 },
    vibration:  { unit: 'in/s', good: [0, 0.15], warnHi: 0.30, alarmHi: 0.50, max: true },
    leak:       { unit: 'dB',   good: [0, 20],   warnHi: 35,  alarmHi: 55,  max: true },
    freeze:     { unit: '°F',   good: [38, 120], warnLo: 36,  alarmLo: 33,  critLo: 32 }
  };

  const SENSOR_FOR_MEASURE = {
    pressure: 'pressure_transducer', flow: 'mag_flow', level: 'radar_level',
    temperature: 'temperature_rtd', turbidity: 'turbidity', ph: 'ph',
    chlorine: 'chlorine_residual', vibration: 'pump_vibration', current: 'motor_current',
    leak: 'acoustic_leak', freeze: 'freeze_probe', position: 'valve_position'
  };

  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  // Diurnal demand multiplier: low at ~3am, twin peaks ~7am and ~7pm.
  function demandMultiplier(hour) {
    const morning = 0.7 * Math.exp(-Math.pow((hour - 7.5) / 1.8, 2));
    const evening = 0.9 * Math.exp(-Math.pow((hour - 19) / 2.2, 2));
    return 0.55 + morning + evening;   // ~0.55 (night) to ~1.7 (peak)
  }

  // ── Per-measure evaluation against bands → {value, score, status} ─────────
  function evalMeasure(measure, value) {
    const b = BANDS[measure];
    if (!b) return { value, score: 1, status: 'healthy', unit: '' };
    let score, status = 'healthy';
    if (b.max) {                                   // one-sided high-is-bad
      score = M.maxScore(value, b.good[1], b.alarmHi);
      if (value > b.alarmHi) status = 'alarm';
      else if (value > b.warnHi) status = 'warning';
    } else if (b.min) {                            // one-sided low-is-bad (reserves, residual)
      const floor = b.critLo != null ? b.critLo : b.alarmLo;
      score = M.minScore(value, b.good[0], floor);
      if (b.critLo != null && value < b.critLo) status = 'critical';
      else if (value < b.alarmLo) status = 'alarm';
      else if (value < b.warnLo) status = 'warning';
    } else {
      const lo = b.good[0], hi = b.good[1];
      score = M.bandScore(value, lo, hi, b.alarmLo != null ? b.alarmLo : lo, b.alarmHi != null ? b.alarmHi : hi);
      if ((b.alarmLo != null && value < b.alarmLo) || (b.alarmHi != null && value > b.alarmHi)) status = 'alarm';
      else if ((b.warnLo != null && value < b.warnLo) || (b.warnHi != null && value > b.warnHi)) status = 'warning';
      if (b.critLo != null && value < b.critLo) status = 'critical';
    }
    return { value, score: clamp(score, 0, 1), status, unit: b.unit };
  }

  // ── Station runtime ───────────────────────────────────────────────────────
  function makeStation(def) {
    const st = {
      def, id: def.id, name: def.name, type: def.type, role: def.role, icon: def.icon,
      repCount: def.repCount, repIndex: def.repIndex, cold: def.cold,
      readings: {},                       // measure → eval result
      health: { x: 1, y: 1, z: 1 },
      signal: new Float32Array(260), sigHead: 0,   // monitor-trace ring buffer
      sigT: 0, sigSeed: Math.random() * 6.283,      // trace time + per-station phase offset
      hist: { level: [], pressure: [], temperature: [], chlorine: [] }, // for predictive trends
      faults: { leak: 0, break: 0, freeze: 0, pumpTrip: false, qualityUpset: 0, sensorFault: null },
      sensorHealth: {},                   // sensorId → {trust, calAgeDays}
      predictions: [],
      alarms: []
    };
    def.sensors.forEach((sid) => {
      const s = SENSORS[sid];
      st.sensorHealth[sid] = { trust: 1, calAgeDays: s ? Math.random() * s.calDays : 0 };
    });
    return st;
  }

  // The duties this station actually measures, derived from its nominal set.
  function measuresOf(st) {
    const n = st.def.nominal, out = [];
    if (n.pressure != null) out.push('pressure');
    if (n.flow != null) out.push('flow');
    if (n.level != null) out.push('level');
    if (n.temp != null) out.push('temperature');
    if (n.turbidity != null) out.push('turbidity');
    if (n.ph != null) out.push('ph');
    if (n.chlorine != null) out.push('chlorine');
    if (n.vibration != null) out.push('vibration');
    if (n.current != null) out.push('current');
    if (n.leak != null) out.push('leak');
    if (n.freeze != null) out.push('freeze');
    return out;
  }

  function pushHist(arr, v) { arr.push(v); if (arr.length > 240) arr.shift(); }
  function trendPerHour(arr, samplesPerHour) {
    if (arr.length < 8) return 0;
    const n = Math.min(arr.length, 60);
    const a = arr.slice(-n);
    // simple least-squares slope per sample, scaled to per-hour
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sx += i; sy += a[i]; sxx += i * i; sxy += i * a[i]; }
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1);
    return slope * samplesPerHour;
  }

  // ── The simulator ─────────────────────────────────────────────────────────
  function Simulator(topology, opts) {
    opts = opts || {};
    this.topology = topology;
    this.stations = topology.stations.map(makeStation);
    this.simHour = 6.0;                 // start at 6am
    this.day = 1;
    this.speed = opts.speed || 120;     // sim-seconds per real-second
    this.samplesPerHour = 0;            // measured for trend scaling
    this._acc = 0;
    this.alarmLog = [];                 // rolling event log
    this._alarmKeys = {};               // de-dupe active alarms
  }

  Simulator.prototype.injectFault = function (stationId, type) {
    const st = this.stations.find((s) => s.id === stationId);
    if (!st) return;
    const f = st.faults;
    if (type === 'leak') f.leak = 1;
    else if (type === 'break') f.break = 1;
    else if (type === 'freeze') f.freeze = 1;
    else if (type === 'pump_trip') f.pumpTrip = true;
    else if (type === 'quality') f.qualityUpset = 1;
    else if (type === 'sensor') f.sensorFault = st.def.sensors[Math.floor(Math.random() * st.def.sensors.length)];
    this._event(st, 'warning', `Fault injected: ${type.replace('_', ' ')}`);
  };
  Simulator.prototype.clearFaults = function () {
    this.stations.forEach((st) => { st.faults = { leak: 0, break: 0, freeze: 0, pumpTrip: false, qualityUpset: 0, sensorFault: null }; });
    this._event(this.stations[0], 'info', 'All injected faults cleared');
  };

  Simulator.prototype._event = function (st, sev, msg) {
    const e = { t: this._clock(), station: st ? st.name : 'SYSTEM', sev, msg };
    this.alarmLog.unshift(e);
    if (this.alarmLog.length > 200) this.alarmLog.pop();
  };
  Simulator.prototype._clock = function () {
    const h = Math.floor(this.simHour), m = Math.floor((this.simHour - h) * 60);
    return `D${this.day} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  // Advance the whole system by realDtMs of wall-clock time. `ext` carries
  // external drivers (weather): { demandFactor, freezeRisk, inflowFactor,
  // sourceTurbidity }. Absent → neutral, so the engine runs standalone.
  Simulator.prototype.tick = function (realDtMs, ext) {
    this.ext = ext || {};
    const simSec = (realDtMs / 1000) * this.speed;
    const dtHour = simSec / 3600;
    this.simHour += dtHour;
    while (this.simHour >= 24) { this.simHour -= 24; this.day++; }
    this.samplesPerHour = dtHour > 0 ? 1 / dtHour : 60;

    const demand = demandMultiplier(this.simHour) * (this.ext.demandFactor || 1);
    this.demand = demand;
    for (const st of this.stations) this._stepStation(st, demand, dtHour);
  };

  Simulator.prototype._stepStation = function (st, demand, dtHour) {
    const n = st.def.nominal, f = st.faults, r = {};
    const cold = st.cold;

    // Rare spontaneous real faults so the board feels alive without being noisy
    // (roughly one developing leak per system per ~day of sim time; deliberate
    // fault injection is the main event).
    if (Math.random() < 0.000003) { f.leak = Math.max(f.leak, 1); this._event(st, 'warning', 'Anomalous night-flow — possible developing leak'); }
    const freezeRisk = this.ext && this.ext.freezeRisk || 0;
    if (cold && n.freeze != null && this.simHour < 9 && Math.random() < (0.000003 + 0.00006 * freezeRisk)) {
      f.freeze = Math.max(f.freeze, 1); this._event(st, 'warning', 'Pipe-wall temperature dropping — freeze risk');
    }

    // ramp fault intensities
    if (f.leak) f.leak = clamp(f.leak + 0.02, 0, 1);
    if (f.break) f.break = clamp(f.break + 0.25, 0, 1);
    if (f.freeze) f.freeze = clamp(f.freeze + 0.03, 0, 1);
    if (f.qualityUpset) f.qualityUpset = clamp(f.qualityUpset + 0.04, 0, 1);

    // ── PRESSURE ──
    if (n.pressure != null) {
      const sag = (st.type === 'pump') ? 0.02 : 0.06;       // pump stations hold pressure better
      let p = n.pressure * (1 - sag * (demand - 1));
      if (f.leak) p -= 14 * f.leak;
      if (f.break) p -= 70 * f.break;
      if (f.freeze) p += 10 * f.freeze - 4;                  // ice → transient rise then choke
      p += rnd(-1.2, 1.2);
      r.pressure = evalMeasure('pressure', clamp(p, 0, 160));
      pushHist(st.hist.pressure, r.pressure.value);
    }

    // ── FLOW ── (expected demand-driven; faults perturb)
    if (n.flow != null) {
      let q = n.flow * demand;
      if (f.leak) q += n.flow * 0.18 * f.leak;               // extra unaccounted flow
      if (f.break) q += n.flow * 2.4 * f.break;              // gush
      if (f.freeze) q *= (1 - 0.7 * f.freeze);               // ice chokes the line
      q = Math.max(0, q + rnd(-0.02, 0.02) * n.flow);
      if (f.pumpTrip) q = 0;                                 // tripped pump → no flow (after noise)
      // flow has no fixed band; score by deviation from expected demand
      const expected = n.flow * demand || 1;
      const dev = Math.abs(q - expected) / expected;
      let fstatus = 'healthy'; if (dev > 1.0) fstatus = 'alarm'; else if (dev > 0.35) fstatus = 'warning';
      if (st.type === 'pump' && q === 0) fstatus = 'critical';
      r.flow = { value: q, score: clamp(1 - dev, 0, 1), status: fstatus, unit: q > 1500 ? 'GPM' : 'GPM' };
    }

    // ── LEVEL / RESERVES ── (storage & source: integrate net flow)
    if (n.level != null) {
      let lvl = (st._level == null) ? n.level : st._level;
      const drawdown = (demand - 1) * 1.1 + (f.break ? 9 * f.break : 0) + (f.leak ? 1.4 * f.leak : 0);
      const refill = (f.pumpTrip ? 0 : 1.0) * (this.ext && this.ext.inflowFactor || 1); // inflow scaled by weather (rain↑/drought↓)
      lvl += (refill - drawdown) * dtHour * 4;               // %/step
      lvl = clamp(lvl + rnd(-0.1, 0.1), 0, 100);
      st._level = lvl;
      r.level = evalMeasure('level', lvl);
      pushHist(st.hist.level, lvl);
    }

    // ── TEMPERATURE / FREEZE ──
    // Buried mains sit near a stable ground temperature year-round (~52°F);
    // air temperature only bites during an actual freeze event, which the
    // freeze fault models by driving the pipe wall down toward 32°F.
    if (n.temp != null || n.freeze != null) {
      const ground = 52;
      const target = f.freeze ? (28 - 4 * f.freeze) : ground; // freeze event pulls the pipe wall toward ~24°F (ice)
      let temp = (st._temp == null) ? (n.temp != null ? n.temp : 50) : st._temp;
      temp += (target - temp) * 0.04;
      temp = clamp(temp + rnd(-0.2, 0.2), -20, 120);
      st._temp = temp;
      if (n.temp != null) { r.temperature = evalMeasure('temperature', temp); pushHist(st.hist.temperature, temp); }
      if (n.freeze != null) r.freeze = evalMeasure('freeze', temp);
    }

    // ── WATER QUALITY ──
    if (n.turbidity != null) {
      const stormTurb = (st.type === 'source' || st.type === 'treatment') ? (this.ext && this.ext.sourceTurbidity || 0) : 0;
      let tb = n.turbidity + (f.qualityUpset ? 6 * f.qualityUpset : 0) + stormTurb + Math.abs(rnd(-0.02, 0.05));
      r.turbidity = evalMeasure('turbidity', Math.max(0, tb));
    }
    if (n.ph != null) r.ph = evalMeasure('ph', n.ph + rnd(-0.08, 0.08) - (f.qualityUpset ? 1.4 * f.qualityUpset : 0));
    if (n.chlorine != null) {
      let cl = n.chlorine - (f.qualityUpset ? 0.7 * f.qualityUpset : 0);
      cl -= (st._temp ? clamp((st._temp - 50) / 200, 0, 0.12) : 0);  // decays a little faster when warm
      r.chlorine = evalMeasure('chlorine', Math.max(0, cl + rnd(-0.03, 0.03)));
      pushHist(st.hist.chlorine, r.chlorine.value);
    }

    // ── PUMP MECHANICALS ──
    if (n.vibration != null) {
      let v = n.vibration + (f.break ? 0.3 * f.break : 0) + (f.pumpTrip ? -n.vibration : 0) + Math.abs(rnd(-0.005, 0.02));
      r.vibration = evalMeasure('vibration', Math.max(0, v));
    }
    if (n.current != null) {
      let cur = f.pumpTrip ? 0 : n.current * (0.9 + 0.2 * (demand - 0.8));
      cur += rnd(-2, 2);
      if (f.pumpTrip) cur = 0;                               // tripped pump draws no current (after noise)
      let cstatus = 'healthy';
      if (f.pumpTrip) cstatus = 'critical';
      else if (cur > n.current * 1.3) cstatus = 'alarm';
      r.current = { value: Math.max(0, cur), score: f.pumpTrip ? 0 : 1, status: cstatus, unit: 'A' };
    }

    // ── ACOUSTIC LEAK ──
    if (n.leak != null) {
      let lk = n.leak + (f.leak ? 40 * f.leak : 0) + (f.break ? 30 * f.break : 0) + Math.abs(rnd(-1, 2));
      r.leak = evalMeasure('leak', lk);
    }

    // ── MONITOR THE MONITORS: sensor trust & calibration ──
    let sensorTrust = 1;
    for (const sid of st.def.sensors) {
      const sh = st.sensorHealth[sid]; const spec = SENSORS[sid];
      sh.calAgeDays += dtHour / 24;
      if (spec && sh.calAgeDays > spec.calDays) sensorTrust = Math.min(sensorTrust, 0.85);  // overdue calibration
      if (f.sensorFault === sid) sh.trust = 0.0; else sh.trust = clamp(sh.trust + 0.01, 0, 1);
      sensorTrust = Math.min(sensorTrust, sh.trust);
    }
    if (f.sensorFault) {
      // make the affected measure's reading visibly untrustworthy (stuck/erratic)
      const fm = Object.keys(SENSOR_FOR_MEASURE).find((mk) => SENSOR_FOR_MEASURE[mk] === f.sensorFault);
      if (fm && r[fm]) { r[fm] = { value: r[fm].value, score: 0.2, status: 'warning', unit: r[fm].unit, untrusted: true }; }
    }

    st.readings = r;

    // ── FOLD ONTO THE MANIFOLD: x (supply), y (integrity & quality) ──
    const supply = M.foldAxis([
      r.pressure && r.pressure.score, r.level && r.level.score, r.flow && r.flow.score
    ].filter((v) => v != null));
    const integrity = M.foldAxis([
      r.leak && r.leak.score, r.freeze && r.freeze.score, r.temperature && r.temperature.score,
      r.turbidity && r.turbidity.score, r.ph && r.ph.score, r.chlorine && r.chlorine.score,
      r.vibration && r.vibration.score, r.current && r.current.score, sensorTrust
    ].filter((v) => v != null));
    const z = M.health(supply, integrity);
    st.health = { x: supply, y: integrity, z, sensorTrust };

    // ── ALARMS from per-measure status (de-duped while active) ──
    for (const mk of Object.keys(r)) {
      const m = r[mk]; if (!m || !m.status) continue;
      const key = st.id + ':' + mk + ':' + m.status;
      if (m.status === 'warning' || m.status === 'alarm' || m.status === 'critical') {
        if (!this._alarmKeys[key]) {
          this._alarmKeys[key] = this.simHour;
          this._event(st, m.status, `${mk} ${m.status.toUpperCase()} — ${fmtVal(m.value)} ${m.unit}${m.untrusted ? ' (sensor untrusted)' : ''}`);
        }
      } else {
        // clear stale keys for this measure when it returns healthy
        Object.keys(this._alarmKeys).forEach((k) => { if (k.startsWith(st.id + ':' + mk + ':')) delete this._alarmKeys[k]; });
      }
    }

    // ── PREDICTIVE ETAs ──
    st.predictions = [];
    if (st.hist.level.length > 10) {
      const dpdh = trendPerHour(st.hist.level, this.samplesPerHour);
      if (dpdh < -0.5 && st._level != null) {
        const hrs = st._level / -dpdh;
        if (hrs < 48) st.predictions.push({ kind: 'depletion', msg: `Reserve depletion in ~${fmtHrs(hrs)}`, sev: hrs < 8 ? 'alarm' : 'warning' });
      }
    }
    if (st.hist.pressure.length > 10) {
      const dpdh = trendPerHour(st.hist.pressure, this.samplesPerHour);
      if (dpdh < -3) st.predictions.push({ kind: 'pressure', msg: `Pressure falling ${dpdh.toFixed(0)} psi/hr — leak/break developing`, sev: 'warning' });
    }
    if (r.temperature && st.hist.temperature.length > 10) {
      const dtdh = trendPerHour(st.hist.temperature, this.samplesPerHour);
      if (dtdh < -0.5 && st._temp != null && st._temp < 45) {
        const hrs = (st._temp - 32) / -dtdh;
        if (hrs < 24) st.predictions.push({ kind: 'freeze', msg: `Freeze risk in ~${fmtHrs(hrs)}`, sev: hrs < 4 ? 'alarm' : 'warning' });
      }
    }
    if (st.hist.chlorine.length > 10) {
      const dcdh = trendPerHour(st.hist.chlorine, this.samplesPerHour);
      if (dcdh < -0.05 && r.chlorine) {
        const hrs = (r.chlorine.value - 0.2) / -dcdh;
        if (hrs < 24 && hrs > 0) st.predictions.push({ kind: 'disinfection', msg: `Chlorine residual reaches min in ~${fmtHrs(hrs)}`, sev: 'warning' });
      }
    }

    // ── monitor-trace sample(s) ──
    this._sensorTrace(st);
  };

  // Synthesize the live "scope" trace from REAL water-sensor behaviour — it keeps
  // the control-room monitor look & feel, but it is NOT a heart rhythm. The trace
  // is the station's hydraulic signature: a slowly breathing pressure/demand
  // baseline, pump/booster cycling, broadband hydraulic turbulence that scales
  // with flow, and fault signatures rendered as real events — a main break as a
  // pressure sag with water-hammer ringing, a leak as a slow downward drift, a
  // pump trip as supply collapsing to a quiet low line, a quality upset as
  // turbidity excursions, a sensor fault as dropouts you cannot trust.
  Simulator.prototype._sensorTrace = function (st) {
    const f = st.faults, r = st.readings, nom = st.def.nominal || {};
    const isPump = st.type === 'pump' || st.type === 'source' || st.type === 'treatment';
    const flowN = (r.flow && nom.flow) ? clamp(r.flow.value / nom.flow, 0, 2) : (r.flow ? 1 : 0);
    const presN = (r.pressure && nom.pressure) ? (r.pressure.value / nom.pressure) : 1;
    const samples = 3;                          // points added per tick → smooth scroll
    for (let i = 0; i < samples; i++) {
      st.sigT += 0.05;                          // time advances steadily
      const t = st.sigT;
      if (f.pumpTrip) {
        // supply lost: pressure & flow collapse → the trace sags and goes quiet
        const v = -0.55 + 0.04 * Math.sin(t * 0.2) + (Math.random() - 0.5) * 0.04;
        st.signal[st.sigHead] = clamp(v, -1, 1.3); st.sigHead = (st.sigHead + 1) % st.signal.length;
        continue;
      }
      // 1) slow pressure/demand baseline (distribution pressure "breathes")
      let v = (presN - 1) * 0.7;
      v += 0.10 * Math.sin(t * 0.15 + st.sigSeed) + 0.05 * Math.sin(t * 0.9 + st.sigSeed * 1.7);
      // 2) pump/booster duty cycling — a rounded undulation, amplitude tracks flow
      if (isPump) { const cyc = t * (0.35 + 0.25 * flowN); v += (0.10 + 0.05 * flowN) * (0.7 * Math.sin(cyc) + 0.3 * Math.sin(2 * cyc + 0.6)); }
      // 3) hydraulic turbulence — broadband noise that grows with flow
      v += (Math.random() - 0.5) * (0.03 + 0.05 * flowN);
      // 4) fault signatures (hydraulic, not cardiac)
      if (f.break > 0.05) { v -= 0.45 * f.break; v += 0.32 * f.break * Math.sin(t * 2.6); v += (Math.random() - 0.5) * 0.18 * f.break; }
      if (f.leak > 0) { v -= clamp(f.leak / 60, 0, 0.25); v += (Math.random() - 0.5) * 0.04; }
      if (f.qualityUpset > 0 && Math.random() < 0.12 * clamp(f.qualityUpset, 0, 1)) v += rnd(0.1, 0.5) * clamp(f.qualityUpset, 0, 1);
      if (f.freeze > 0) v += -0.10 * f.freeze + 0.06 * Math.sin(t * 0.07);
      if (f.sensorFault && Math.random() < 0.15) v = (Math.random() < 0.5) ? 0 : v + rnd(-0.3, 0.3); // dropouts / stuck / spikes
      st.signal[st.sigHead] = clamp(v, -1, 1.3);
      st.sigHead = (st.sigHead + 1) % st.signal.length;
    }
  };

  // System-wide aggregate health on the same manifold.
  Simulator.prototype.aggregate = function () {
    const zs = this.stations.map((s) => s.health.z);
    const minZ = Math.min.apply(null, zs);            // worst station dominates
    const meanZ = zs.reduce((a, b) => a + b, 0) / (zs.length || 1);
    const z = Math.min(meanZ, 0.5 + minZ * 0.5);      // pulled down by the weakest
    let warn = 0, alarm = 0;
    Object.keys(this._alarmKeys).forEach((k) => { if (/:alarm$|:critical$/.test(k)) alarm++; else warn++; });
    return { z, meanZ, minZ, warn, alarm };
  };

  function fmtVal(v) { return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2); }
  function fmtHrs(h) { if (h < 1) return Math.round(h * 60) + ' min'; if (h < 24) return h.toFixed(1) + ' h'; return (h / 24).toFixed(1) + ' d'; }

  root.HM_ENGINE = { Simulator, BANDS, demandMultiplier, evalMeasure, SENSOR_FOR_MEASURE };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HM_ENGINE;

}(typeof window !== 'undefined' ? window : globalThis));
