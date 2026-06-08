/* ============================================================================
 * HydroManifold — Scaling Topology
 * ----------------------------------------------------------------------------
 * One monitoring framework, every scale. A real water system is a hierarchy:
 *
 *   SOURCE → TREATMENT → PUMPING → STORAGE → PRV/DMA → DISTRIBUTION → SERVICE
 *
 * The SAME station template (a monitoring stack of real sensors) is reused at
 * every tier; only the COUNT and the nominal duties change. A single home is
 * one service connection with 3 sensors; a city is ~1,400 stations and ~12,000
 * sensors of the exact same kinds. That is the whole point: it scales without
 * being reinvented.
 *
 * buildTopology(tierId) returns:
 *   { tier, stations[], totals }
 * where stations[] are REPRESENTATIVE instances actually simulated/drawn, and
 * totals carries the TRUE counts (stations, sensors, population, demand) so the
 * scale story is honest even though we don't render ten thousand panels.
 * ========================================================================== */
(function (root) {
  'use strict';

  // Each station type = a reusable monitoring stack. `m` lists the live
  // measures the engine simulates; `sensors` is the real instrument list.
  const STATION_TEMPLATES = {
    source: {
      role: 'Source / Well', icon: '⛲',
      sensors: ['submersible_level', 'mag_flow', 'motor_current', 'pump_vibration', 'turbidity', 'temperature_rtd'],
      nominal: { level: 78, flow: 1800, current: 220, vibration: 0.08, turbidity: 0.4, temp: 52 }
    },
    treatment: {
      role: 'Treatment Plant', icon: '🏭',
      sensors: ['mag_flow', 'turbidity', 'ph', 'chlorine_residual', 'pressure_transducer', 'temperature_rtd'],
      nominal: { flow: 5200, turbidity: 0.10, ph: 7.6, chlorine: 1.2, pressure: 72, temp: 54 }
    },
    pump: {
      role: 'Booster Pump Station', icon: '🛟',
      sensors: ['pressure_transducer', 'mag_flow', 'motor_current', 'pump_vibration', 'temperature_rtd'],
      nominal: { pressure: 92, flow: 1400, current: 180, vibration: 0.07, temp: 56 }
    },
    storage: {
      role: 'Storage Tank / Reservoir', icon: '🛢️',
      sensors: ['radar_level', 'pressure_transducer', 'chlorine_residual', 'temperature_rtd', 'freeze_probe'],
      nominal: { level: 72, pressure: 64, chlorine: 0.9, temp: 50, freeze: 50 }
    },
    prv: {
      role: 'PRV / Pressure Zone', icon: '🎚️',
      sensors: ['pressure_transducer', 'mag_flow', 'valve_position', 'acoustic_leak'],
      nominal: { pressure: 68, flow: 900, position: 55, leak: 12 }
    },
    distribution: {
      role: 'Distribution / DMA', icon: '🕸️',
      sensors: ['pressure_transducer', 'mag_flow', 'pressure_transient', 'acoustic_leak', 'chlorine_residual'],
      nominal: { pressure: 70, flow: 1100, chlorine: 0.6, leak: 10 }
    },
    service: {
      role: 'Service Connection', icon: '🏠',
      sensors: ['pd_meter', 'pressure_transducer', 'temperature_rtd'],
      nominal: { pressure: 60, flow: 4, temp: 55 }
    }
  };

  function sensorsPer(type, cold) {
    let n = STATION_TEMPLATES[type].sensors.length;
    if (cold && (type === 'service' || type === 'distribution')) n += 1; // add freeze probe in cold climates
    return n;
  }

  // Tiers, smallest → largest. `comp` = how many of each station type exist.
  // `cap` = how many representative instances per type we actually render.
  const TIERS = [
    { id: 'single_family', name: 'Single-family home', icon: '🏠', cold: true,
      blurb: 'One service connection: the meter, line pressure, and freeze protection.',
      population: 3, demandMgd: 0.0003,
      comp: { service: 1 }, cap: { service: 1 } },

    { id: 'apartment', name: 'Apartment complex', icon: '🏢', cold: true,
      blurb: 'Booster pump + rooftop storage feeding many units.',
      population: 400, demandMgd: 0.04,
      comp: { pump: 1, storage: 1, service: 180 }, cap: { pump: 1, storage: 1, service: 2 } },

    { id: 'business', name: 'Business / commercial', icon: '🏬', cold: true,
      blurb: 'Metered commercial service with backflow and fire supply monitoring.',
      population: 250, demandMgd: 0.03,
      comp: { pump: 1, service: 12 }, cap: { pump: 1, service: 2 } },

    { id: 'highrise', name: 'High-rise / skyscraper', icon: '🌆', cold: true,
      blurb: 'Stacked pressure zones: a booster + PRV every ~10 floors, rooftop tank.',
      population: 5000, demandMgd: 0.45,
      comp: { pump: 6, prv: 6, storage: 2, service: 60 }, cap: { pump: 2, prv: 1, storage: 1, service: 1 } },

    { id: 'hospital', name: 'Hospital (critical facility)', icon: '🏥', cold: true,
      blurb: 'Redundant supply, on-site reserve, continuous quality — zero tolerance for loss.',
      population: 3000, demandMgd: 0.6,
      comp: { pump: 4, storage: 3, treatment: 1, distribution: 4, service: 30 },
      cap: { pump: 1, storage: 1, treatment: 1, distribution: 1, service: 1 } },

    { id: 'arena', name: 'Stadium / arena', icon: '🏟️', cold: false,
      blurb: 'Enormous, spiky peak demand at intermission; large reserve to ride it out.',
      population: 65000, demandMgd: 1.1,
      comp: { pump: 6, storage: 4, prv: 8, distribution: 10, service: 120 },
      cap: { pump: 2, storage: 1, prv: 1, distribution: 1, service: 1 } },

    { id: 'datacenter', name: 'Data center / data farm', icon: '🖥️', cold: true,
      blurb: 'Evaporative cooling makeup + potable; reliability and temperature are king.',
      population: 800, demandMgd: 3.5,
      comp: { source: 2, pump: 8, storage: 4, distribution: 12, service: 40 },
      cap: { source: 1, pump: 2, storage: 1, distribution: 1, service: 1 } },

    { id: 'powerplant', name: 'Power / nuclear plant', icon: '⚡', cold: false,
      blurb: 'Massive cooling-water intake plus safety-grade make-up; flows in the hundreds of MGD.',
      population: 1500, demandMgd: 480,
      comp: { source: 4, treatment: 2, pump: 16, storage: 8, distribution: 20, service: 60 },
      cap: { source: 1, treatment: 1, pump: 2, storage: 1, distribution: 1, service: 1 } },

    { id: 'farm', name: 'Farm / agricultural', icon: '🚜', cold: true,
      blurb: 'Wells + irrigation mains over a wide area; aquifer level and pump health matter most.',
      population: 60, demandMgd: 2.2,
      comp: { source: 6, pump: 10, storage: 3, distribution: 14, service: 20 },
      cap: { source: 2, pump: 1, storage: 1, distribution: 1, service: 1 } },

    { id: 'cruise_ship', name: 'Cruise ship / offshore platform', icon: '🚢', cold: false,
      blurb: 'Self-contained supply at sea: desalination + bunkered water, tankage, potable vs grey — zero margin for loss.',
      population: 5000, demandMgd: 0.55,
      comp: { source: 2, treatment: 1, pump: 4, storage: 4, distribution: 6, service: 30 },
      cap: { source: 1, treatment: 1, pump: 1, storage: 1, distribution: 1, service: 1 } },

    { id: 'military_base', name: 'Military installation / deployment', icon: '🪖', cold: true,
      blurb: 'Hardened, classified, priority-diversion supply with mutual-aid and contamination-response readiness.',
      population: 12000, demandMgd: 2.6,
      comp: { source: 3, treatment: 1, pump: 6, storage: 4, prv: 4, distribution: 12, service: 400 },
      cap: { source: 1, treatment: 1, pump: 2, storage: 1, prv: 1, distribution: 1, service: 1 } },

    { id: 'township', name: 'Township / rural system', icon: '🏘️', cold: true,
      blurb: 'A complete small utility: source, treatment, a tank, a few DMAs, the meters.',
      population: 6000, demandMgd: 0.9,
      comp: { source: 2, treatment: 1, pump: 3, storage: 2, prv: 4, distribution: 8, service: 2200 },
      cap: { source: 1, treatment: 1, pump: 1, storage: 1, prv: 1, distribution: 2, service: 1 } },

    { id: 'reservoir_dam', name: 'Reservoir & dam', icon: '🏞️', cold: true,
      blurb: 'Raw-water storage: reservoir level, dam seepage/integrity, intake control.',
      population: 0, demandMgd: 60,
      comp: { source: 3, storage: 6, distribution: 6 },
      cap: { source: 1, storage: 2, distribution: 1 } },

    { id: 'city', name: 'City water system', icon: '🌃', cold: true,
      blurb: 'Full distribution: multiple sources & plants, pump stations, tanks, dozens of DMAs, thousands of meters.',
      population: 240000, demandMgd: 36,
      comp: { source: 8, treatment: 3, pump: 22, storage: 18, prv: 40, distribution: 90, service: 62000 },
      cap: { source: 1, treatment: 1, pump: 2, storage: 1, prv: 1, distribution: 2, service: 1 } },

    { id: 'region', name: 'Regional / national supply', icon: '🗺️', cold: true,
      blurb: 'Aqueducts and transmission tying multiple cities, reservoirs, and plants together.',
      population: 4200000, demandMgd: 620,
      comp: { source: 30, treatment: 14, pump: 180, storage: 140, prv: 320, distribution: 900, service: 1100000 },
      cap: { source: 1, treatment: 1, pump: 2, storage: 1, prv: 1, distribution: 2, service: 1 } }
  ];

  function tierById(id) { return TIERS.find((t) => t.id === id) || TIERS[0]; }

  // Build the representative, simulatable topology + honest totals.
  function buildTopology(tierId) {
    const tier = tierById(tierId);
    const stations = [];
    let totalStations = 0, totalSensors = 0;
    const order = ['source', 'treatment', 'pump', 'storage', 'prv', 'distribution', 'service'];

    for (const type of order) {
      const count = tier.comp[type] || 0;
      if (!count) continue;
      totalStations += count;
      totalSensors += count * sensorsPer(type, tier.cold);

      const tpl = STATION_TEMPLATES[type];
      const show = Math.min(tier.cap[type] || 1, count);
      for (let i = 0; i < show; i++) {
        const sensors = tpl.sensors.slice();
        if (tier.cold && (type === 'service' || type === 'distribution')) sensors.push('freeze_probe');
        stations.push({
          id: `${tier.id}-${type}-${i + 1}`,
          type, role: tpl.role, icon: tpl.icon,
          name: stationName(type, i, tier),
          sensors,
          nominal: Object.assign({}, tpl.nominal),
          cold: tier.cold,
          repCount: count,          // how many real stations this panel stands for
          repIndex: i + 1
        });
      }
    }

    return {
      tier,
      stations,
      totals: {
        stations: totalStations,
        sensors: totalSensors,
        population: tier.population,
        demandMgd: tier.demandMgd
      }
    };
  }

  function stationName(type, i, tier) {
    const N = i + 1;
    switch (type) {
      case 'source': return `Source ${N}`;
      case 'treatment': return `Treatment Plant ${N}`;
      case 'pump': return `Booster Station ${N}`;
      case 'storage': return `Storage Tank ${N}`;
      case 'prv': return `Pressure Zone ${N}`;
      case 'distribution': return `DMA ${N}`;
      case 'service': return tier.id === 'single_family' ? 'House service' : `Service Cluster ${N}`;
      default: return `Station ${N}`;
    }
  }

  root.HM_TOPOLOGY = { TIERS, STATION_TEMPLATES, buildTopology, tierById, sensorsPer };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HM_TOPOLOGY;

}(typeof window !== 'undefined' ? window : globalThis));
