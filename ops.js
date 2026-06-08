/* ============================================================================
 * HydroManifold — Operations orchestrator
 * Ties weather → engine → analysis → economics into one step() the UI calls
 * each frame. Owns the weather + economics state; recomputes forecast/usage/
 * analysis from the live simulator. Exposes `state` for rendering.
 * ========================================================================== */
(function (root) {
  'use strict';
  const W = root.HM_WEATHER, F = root.HM_FORECAST, A = root.HM_ANALYSIS, E = root.HM_ECON;

  function Ops(sim, opts) {
    opts = opts || {};
    this.sim = sim;
    this.weather = new W.Weather(opts.weather || {});
    this.econ = new E.Economics(sim);
    this.state = {};
  }

  // Advance everything by realDtMs of wall clock. Weather is computed first so
  // it drives the engine tick; analysis & economics read the result.
  Ops.prototype.step = function (realDtMs) {
    const sim = this.sim;
    const dtHour = (realDtMs / 1000 * sim.speed) / 3600;
    this.weather.step(dtHour, sim.simHour);
    const ext = {
      demandFactor: this.weather.demandFactor(),
      freezeRisk: this.weather.freezeRisk(),
      inflowFactor: this.weather.inflowFactor(),
      sourceTurbidity: this.weather.sourceTurbidity()
    };
    sim.tick(realDtMs, ext);

    const analysis = A.analyze(sim);
    this.econ.update(sim, this.weather, analysis, dtHour);
    const forecast = F.forecastDemand(sim, this.weather, 24, 1);
    this.state = {
      weather: this.weather.describe(),
      usage: F.usage(sim),
      forecast,
      peak: F.peak(forecast),
      analysis,
      econ: this.econ.snapshot(sim, this.weather, analysis)
    };
    return this.state;
  };

  Ops.prototype.setWeather = function (name) { this.weather.setScenario(name); };

  root.HM_OPS = { Ops };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HM_OPS;
}(typeof window !== 'undefined' ? window : globalThis));
