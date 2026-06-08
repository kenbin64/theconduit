/* ============================================================================
 * HydroManifold — Economics, Markets & Logistics
 * ----------------------------------------------------------------------------
 * Operating cost, budget vs. actual (overruns), savings from detection &
 * optimization, a daily spot + futures water market, supplier alternatives,
 * and logistics (crews, tankers, chemical resupply). Stateful: update() each
 * tick accumulates the day; snapshot() exposes it to the UI.
 *
 * Cost basis (transparent, representative US utility figures):
 *   pumping energy ~1,500 kWh/MG × $0.12/kWh = $180/MG
 *   treatment chemicals                        = $55/MG
 *   labor & overhead                           = $90/MG
 *   → base production O&M                       ≈ $325/MG
 * Water spot price anchored near the Nasdaq Veles CA Water Index range
 * (~$300–1,200/acre-foot); 1 acre-foot = 0.3259 MG.
 * ========================================================================== */
(function (root) {
  'use strict';
  const AF_TO_MG = 0.3259;
  const ENERGY_PER_MG = 180, CHEM_PER_MG = 55, LABOR_PER_MG = 90;
  const BASE_OP_PER_MG = ENERGY_PER_MG + CHEM_PER_MG + LABOR_PER_MG; // 325

  const SUPPLIERS = [
    { id: 'own',     name: 'Own source + treatment', perMg: BASE_OP_PER_MG, leadH: 0,   reliability: 0.99, note: 'Cheapest; primary supply.' },
    { id: 'wsa',     name: 'Regional wholesale A',    perMg: 480,           leadH: 1,   reliability: 0.97, note: 'Interconnect; standing contract.' },
    { id: 'wsb',     name: 'Neighbor utility B',      perMg: 610,           leadH: 2,   reliability: 0.95, note: 'Mutual-aid backup.' },
    { id: 'tanker',  name: 'Emergency tanker fleet',  perMg: 2400,          leadH: 0.5, reliability: 0.99, note: 'Last resort; trucked to outage areas.' }
  ];

  function Economics(sim) {
    this.sim = sim;
    const avgMgd = sim.topology.totals.demandMgd || 0.001;
    this.budgetDaily = avgMgd * BASE_OP_PER_MG;     // expected daily O&M
    this.dayCost = 0; this.dayOverrun = 0; this.daySavings = 0;
    this.mgDelivered = 0; this.mgLost = 0;
    this._lastDay = sim.day;
    this.spotAF = 540 + Math.random() * 80;         // $/acre-foot
    this.futures = this._buildFutures();
    this.dispatches = [];                           // active logistics
    this.chemDaysLeft = 9 + Math.random() * 6;      // chemical resupply countdown
  }

  Economics.prototype._buildFutures = function (drought) {
    drought = drought || 0;
    const months = ['+1mo', '+2mo', '+3mo', '+6mo', '+12mo'];
    const base = this.spotAF;
    return months.map((m, i) => {
      const contango = 1 + (0.015 * (i + 1)) + drought * 0.06 * (i + 1); // drought steepens the curve
      return { term: m, priceAF: base * contango };
    });
  };

  Economics.prototype.update = function (sim, weather, analysis, dtHour) {
    // new day → roll the ledger
    if (sim.day !== this._lastDay) {
      this._lastDay = sim.day; this.dayCost = 0; this.dayOverrun = 0; this.daySavings = 0;
      this.mgDelivered = 0; this.mgLost = 0;
    }
    const instMgd = (sim.topology.totals.demandMgd || 0) * (sim.demand || 1);
    const mgThisStep = instMgd * (dtHour / 24);
    this.mgDelivered += mgThisStep;

    // energy is higher at peak demand and when sources are strained
    const peakK = 0.85 + 0.4 * (sim.demand || 1);
    let stepCost = mgThisStep * (ENERGY_PER_MG * peakK + CHEM_PER_MG + LABOR_PER_MG);

    // water loss from active leaks/breaks costs finished-water production
    let lossGpm = 0; (analysis.leaks || []).forEach((l) => { lossGpm += l.lossGpm; });
    const mgLostStep = (lossGpm / 1e6) * 1440 * (dtHour / 24);
    this.mgLost += mgLostStep;
    stepCost += mgLostStep * (BASE_OP_PER_MG + spotPerMg(this.spotAF));

    // emergency purchases when supply is in deficit
    if (analysis.loadBalance && analysis.loadBalance.status === 'deficit') {
      const buyMg = instMgd * 0.25 * (dtHour / 24);
      stepCost += buyMg * 610;                       // pulling from wholesale/tanker mix
    }
    // crew/tanker mobilization cost when new dispatches open
    this._syncLogistics(sim, analysis);
    this.dispatches.forEach((d) => { stepCost += d.hourly * dtHour; });

    this.dayCost += stepCost;

    // budget vs actual so far today
    const elapsedFrac = ((sim.day - 1) * 24 + sim.simHour) % 24 / 24 || 0.0001;
    const expectedSoFar = this.budgetDaily * (sim.simHour / 24);
    this.dayOverrun = this.dayCost - expectedSoFar;

    // savings: detected leaks fixed early avoid weeks of loss; off-peak pumping;
    // predictive maintenance avoids an emergency repair (~$25k each).
    let sav = 0;
    (analysis.leaks || []).forEach((l) => { if (l.severity === 'leak') sav += l.lossGpm * 0.002 * dtHour; });
    if (sim.simHour < 6 || sim.simHour > 22) sav += this.budgetDaily * 0.015 * dtHour;   // off-peak energy
    (analysis.maintenance || []).forEach((m) => { if (m.kind === 'bearing') sav += 1200 * dtHour; });
    this.daySavings += sav;

    // market random-walk, nudged by drought
    const drought = weather ? weather.droughtIdx : 0;
    this.spotAF += (this.spotAF * (Math.random() - 0.5) * 0.01) + drought * 1.4 * dtHour;
    this.spotAF = Math.max(180, Math.min(1600, this.spotAF));
    if (Math.random() < 0.02) this.futures = this._buildFutures(drought);

    // chemical resupply countdown (faster use under high turbidity/demand)
    this.chemDaysLeft -= (dtHour / 24) * (0.8 + 0.4 * (sim.demand || 1));
    if (this.chemDaysLeft < 0) this.chemDaysLeft = 9 + Math.random() * 6;  // resupply arrives
  };

  Economics.prototype._syncLogistics = function (sim, analysis) {
    // open a dispatch for each recovery plan / outage that doesn't have one
    const want = new Set();
    (analysis.recovery || []).forEach((p) => want.add(p.station));
    (analysis.outages || []).forEach((o) => want.add(o.station));
    // drop completed
    this.dispatches = this.dispatches.filter((d) => want.has(d.station));
    want.forEach((stn) => {
      if (!this.dispatches.find((d) => d.station === stn)) {
        const outage = (analysis.outages || []).find((o) => o.station === stn);
        const tankers = outage ? Math.max(1, Math.round(outage.affectedPeople / 5000)) : 0;
        this.dispatches.push({
          station: stn, crew: 'Repair crew', etaMin: 18 + Math.round(Math.random() * 20),
          tankers, hourly: 240 + tankers * 180,        // crew + tanker $/h
          mobilization: 1500 + tankers * 600
        });
      }
    });
  };

  Economics.prototype.recommendSupply = function (sim, analysis) {
    const need = (sim.topology.totals.demandMgd || 0) * (sim.demand || 1);
    const ownCap = (sim.topology.totals.demandMgd || 0) * 1.6;
    const ownOnline = !analysis.loadBalance || analysis.loadBalance.status !== 'deficit';
    const mix = [];
    let remaining = need;
    const order = ownOnline ? SUPPLIERS : SUPPLIERS.slice(1);  // skip own if in deficit
    for (const s of order) {
      if (remaining <= 0) break;
      const cap = s.id === 'own' ? ownCap : need;             // others effectively elastic
      const take = Math.min(remaining, cap);
      if (take > 0.0001) { mix.push({ supplier: s.name, mgd: take, perMg: s.perMg, cost: take * s.perMg }); remaining -= take; }
    }
    const blended = mix.reduce((a, m) => a + m.cost, 0) / (need || 1);
    return { mix, blendedPerMg: blended, suppliers: SUPPLIERS };
  };

  Economics.prototype.snapshot = function (sim, weather, analysis) {
    return {
      budgetDaily: this.budgetDaily,
      dayCost: this.dayCost,
      dayOverrun: this.dayOverrun,
      overrunPct: this.budgetDaily ? (this.dayOverrun / this.budgetDaily) * 100 : 0,
      daySavings: this.daySavings,
      mgDelivered: this.mgDelivered,
      mgLost: this.mgLost,
      spotAF: this.spotAF,
      spotPerMg: spotPerMg(this.spotAF),
      futures: this.futures,
      supply: this.recommendSupply(sim, analysis),
      dispatches: this.dispatches,
      chemDaysLeft: this.chemDaysLeft
    };
  };

  function spotPerMg(spotAF) { return spotAF / AF_TO_MG; }

  root.HM_ECON = { Economics, SUPPLIERS, BASE_OP_PER_MG, AF_TO_MG, spotPerMg };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HM_ECON;
}(typeof window !== 'undefined' ? window : globalThis));
