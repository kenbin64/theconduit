/* ============================================================================
 * HydroManifold — Weather model
 * ----------------------------------------------------------------------------
 * Weather is the biggest external driver of a water system: heat waves spike
 * demand, hard freezes burst pipes, storms foul source turbidity, and droughts
 * draw reservoirs down. This model evolves a weather state over sim time and
 * exposes the factors the engine/economics consume:
 *   demandFactor()   multiply normal demand (hot↑, rain↓)
 *   freezeRisk()     0..1 likelihood the cold is severe enough to freeze pipes
 *   inflowFactor()   multiply source/reservoir inflow (rain↑, drought↓)
 *   sourceTurbidity()extra raw-water turbidity after storms
 * ========================================================================== */
(function (root) {
  'use strict';
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  // scenario → steady-state influences
  const SCEN = {
    clear:    { label: 'Clear',     air: 64, demand: 1.00, inflow: 1.00, freeze: 0.0,  turb: 0,   drought: 0 },
    hot:      { label: 'Hot',       air: 92, demand: 1.22, inflow: 0.92, freeze: 0.0,  turb: 0,   drought: 0.1 },
    heatwave: { label: 'Heat wave', air: 104,demand: 1.45, inflow: 0.82, freeze: 0.0,  turb: 0,   drought: 0.25 },
    rain:     { label: 'Rain',      air: 54, demand: 0.86, inflow: 1.30, freeze: 0.0,  turb: 1.2, drought: -0.2 },
    storm:    { label: 'Storm',     air: 49, demand: 0.80, inflow: 1.55, freeze: 0.0,  turb: 4.0, drought: -0.3 },
    cold:     { label: 'Cold snap', air: 22, demand: 0.95, inflow: 0.90, freeze: 0.45, turb: 0,   drought: 0 },
    hardfreeze:{label: 'Hard freeze',air:6,  demand: 1.05, inflow: 0.80, freeze: 0.9,  turb: 0,   drought: 0 },
    drought:  { label: 'Drought',   air: 88, demand: 1.18, inflow: 0.45, freeze: 0.0,  turb: 0.4, drought: 0.8 }
  };

  function Weather(opts) {
    opts = opts || {};
    this.scenario = opts.scenario || 'clear';
    this.airTempF = SCEN[this.scenario].air;
    this.droughtIdx = Math.max(0, SCEN[this.scenario].drought);
    this._sinceHr = 0;
    this.auto = opts.auto !== false;     // drift between scenarios on its own
  }
  Weather.SCENARIOS = SCEN;

  Weather.prototype.setScenario = function (name) {
    if (!SCEN[name]) return;
    this.scenario = name; this._sinceHr = 0;
  };

  Weather.prototype.step = function (dtHour, simHour) {
    const s = SCEN[this.scenario];
    this._sinceHr += dtHour;
    // air temp tracks scenario steady-state plus a diurnal swing
    const target = s.air + 9 * Math.sin((simHour - 15) / 24 * 2 * Math.PI);
    this.airTempF += (target - this.airTempF) * 0.05;
    // drought index drifts toward the scenario's pull
    this.droughtIdx = clamp(this.droughtIdx + (clamp(s.drought, 0, 1) - this.droughtIdx) * 0.01, 0, 1);
    // occasional autonomous weather change (a few sim-hours apart)
    if (this.auto && this._sinceHr > 6 && Math.random() < 0.0008) {
      const names = Object.keys(SCEN);
      this.setScenario(names[Math.floor(Math.random() * names.length)]);
    }
  };

  Weather.prototype.demandFactor = function () { return SCEN[this.scenario].demand; };
  Weather.prototype.freezeRisk = function () { return SCEN[this.scenario].freeze; };
  Weather.prototype.inflowFactor = function () { return SCEN[this.scenario].inflow * (1 - 0.4 * this.droughtIdx); };
  Weather.prototype.sourceTurbidity = function () { return SCEN[this.scenario].turb; };
  Weather.prototype.describe = function () {
    return { scenario: this.scenario, label: SCEN[this.scenario].label, airTempF: this.airTempF, droughtIdx: this.droughtIdx };
  };

  root.HM_WEATHER = { Weather };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HM_WEATHER;
}(typeof window !== 'undefined' ? window : globalThis));
