/* ============================================================================
 * HydroManifold — Usage & Forecast
 * Current usage per unit + a forward demand forecast with confidence bands.
 * Pure functions over the simulator + weather state.
 * ========================================================================== */
(function (root) {
  'use strict';
  const ENG = root.HM_ENGINE;

  // Current usage, broken out per unit.
  function usage(sim) {
    const T = sim.topology.totals;
    const avgMgd = T.demandMgd || 0;
    const instMgd = avgMgd * (sim.demand || 1);                 // instantaneous draw
    const pop = T.population || 0;
    const conns = sim.topology.tier.comp.service || 0;
    return {
      avgMgd,
      instMgd,
      instGpm: instMgd * 1e6 / 1440,                            // MGD → GPM
      perCapitaGpd: pop ? (avgMgd * 1e6) / pop : null,          // gallons/person/day
      perConnectionGpd: conns ? (avgMgd * 1e6) / conns : null,  // gallons/connection/day
      connections: conns,
      population: pop
    };
  }

  // Forward demand forecast. Confidence widens with horizon and with weather
  // volatility (a heat wave or storm makes tomorrow less certain).
  function forecastDemand(sim, weather, hoursAhead, stepHr) {
    hoursAhead = hoursAhead || 24; stepHr = stepHr || 1;
    const avgMgd = sim.topology.totals.demandMgd || 0;
    const wFactor = weather ? weather.demandFactor() : 1;
    const vol = weather ? weatherVolatility(weather) : 0.06;
    const out = [];
    for (let h = 0; h <= hoursAhead; h += stepHr) {
      const hr = (sim.simHour + h) % 24;
      const mult = ENG.demandMultiplier(hr) * wFactor;
      const mgd = avgMgd * mult;
      const band = mgd * (0.04 + vol * (h / hoursAhead));      // ±% grows out to horizon
      out.push({ h, hour: hr, mgd, lo: Math.max(0, mgd - band), hi: mgd + band });
    }
    return out;
  }

  function weatherVolatility(weather) {
    const s = weather.scenario;
    if (s === 'heatwave' || s === 'storm' || s === 'hardfreeze') return 0.16;
    if (s === 'hot' || s === 'rain' || s === 'drought' || s === 'cold') return 0.10;
    return 0.05;
  }

  function peak(forecast) {
    let best = forecast[0];
    for (const p of forecast) if (p.mgd > best.mgd) best = p;
    return best;
  }

  root.HM_FORECAST = { usage, forecastDemand, peak, weatherVolatility };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HM_FORECAST;
}(typeof window !== 'undefined' ? window : globalThis));
