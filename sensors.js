/* ============================================================================
 * HydroManifold — Sensor Catalog
 * ----------------------------------------------------------------------------
 * Real-world water-utility / SCADA instrumentation. Figures are representative
 * of commercial municipal-grade equipment (2020s pricing, USD). Sources of
 * truth in practice: AWWA standards, manufacturer datasheets (Endress+Hauser,
 * Rosemount, Hach, Sensus, Badger, ABB), and utility asset registers.
 *
 * Each entry carries what an asset manager actually tracks:
 *   measures      what physical quantity it reads
 *   unit          engineering unit
 *   range         typical measuring span
 *   accuracy      manufacturer accuracy (of reading or full-scale)
 *   responseMs    how fast it responds (drives EKG realism)
 *   costUsd       installed cost band [low, typical, high]
 *   mtbfHours     mean time between failures (reliability)
 *   calDays       calibration interval (drives "monitor the monitors")
 *   power         powered or loop/battery
 *   protocol      how it reports to SCADA
 *   selfDiag      does the device report its own health (NAMUR NE107 etc.)
 *   notes         real-world caveat
 *
 * Nothing here is invented for flavor; these are the instruments a water
 * system genuinely runs on.
 * ========================================================================== */
(function (root) {
  'use strict';

  const SENSOR_CATALOG = {
    pressure_transducer: {
      id: 'pressure_transducer', name: 'Pressure transducer (piezoresistive)',
      measures: 'pressure', unit: 'psi', range: [0, 150], accuracy: '±0.25% FS',
      responseMs: 50, costUsd: [250, 450, 800], mtbfHours: 50000, calDays: 365,
      power: '4–20 mA loop / HART', protocol: '4-20mA / HART / Modbus', selfDiag: true,
      notes: 'Workhorse of distribution monitoring. Drift and zero-offset are the usual failure mode.'
    },
    pressure_transient: {
      id: 'pressure_transient', name: 'High-speed transient / surge logger',
      measures: 'pressure', unit: 'psi', range: [0, 250], accuracy: '±0.1% FS',
      responseMs: 2, costUsd: [2000, 3500, 6000], mtbfHours: 60000, calDays: 365,
      power: 'mains + battery', protocol: 'cellular / Modbus', selfDiag: true,
      notes: 'Captures water hammer at 100+ Hz; first to see a main break or slammed valve.'
    },
    mag_flow: {
      id: 'mag_flow', name: 'Electromagnetic flow meter (mag meter)',
      measures: 'flow', unit: 'GPM', range: [0, 20000], accuracy: '±0.5% rate',
      responseMs: 100, costUsd: [1500, 4000, 9000], mtbfHours: 100000, calDays: 1825,
      power: 'mains', protocol: '4-20mA / Modbus / HART', selfDiag: true,
      notes: 'No moving parts; the standard for mains and treatment. Needs full pipe + conductive water.'
    },
    ultrasonic_flow: {
      id: 'ultrasonic_flow', name: 'Clamp-on ultrasonic flow meter',
      measures: 'flow', unit: 'GPM', range: [0, 15000], accuracy: '±1–2% rate',
      responseMs: 200, costUsd: [1000, 2800, 5000], mtbfHours: 80000, calDays: 730,
      power: 'mains / battery', protocol: 'Modbus / cellular', selfDiag: true,
      notes: 'Non-invasive, retrofit-friendly; accuracy depends on pipe condition and seating.'
    },
    pd_meter: {
      id: 'pd_meter', name: 'Positive-displacement service meter (AMI)',
      measures: 'flow', unit: 'GPM', range: [0, 50], accuracy: '±1.5%',
      responseMs: 500, costUsd: [80, 180, 350], mtbfHours: 175000, calDays: 3650,
      power: 'battery (AMI radio)', protocol: 'AMI / LoRaWAN', selfDiag: false,
      notes: 'The meter on a house. AMI radios report daily/hourly; backflow + tamper flags.'
    },
    radar_level: {
      id: 'radar_level', name: 'Non-contact radar level (tanks/reservoirs)',
      measures: 'level', unit: 'ft', range: [0, 120], accuracy: '±2 mm',
      responseMs: 300, costUsd: [1500, 2800, 4500], mtbfHours: 120000, calDays: 1825,
      power: 'mains / loop', protocol: '4-20mA / Modbus', selfDiag: true,
      notes: 'Preferred for storage; immune to vapor/foam. Drives reserve % and depletion ETA.'
    },
    submersible_level: {
      id: 'submersible_level', name: 'Submersible hydrostatic level',
      measures: 'level', unit: 'ft', range: [0, 60], accuracy: '±0.25% FS',
      responseMs: 200, costUsd: [400, 900, 1800], mtbfHours: 70000, calDays: 730,
      power: 'loop', protocol: '4-20mA', selfDiag: false,
      notes: 'Wells and wet-wells. Cheaper than radar but the diaphragm fouls over time.'
    },
    turbidity: {
      id: 'turbidity', name: 'Turbidity analyzer (nephelometric)',
      measures: 'turbidity', unit: 'NTU', range: [0, 1000], accuracy: '±2% rdg',
      responseMs: 1000, costUsd: [1500, 2800, 4500], mtbfHours: 45000, calDays: 90,
      power: 'mains', protocol: '4-20mA / Modbus', selfDiag: true,
      notes: 'Regulated at treatment (combined filter effluent ≤0.3 NTU). Optics need cleaning.'
    },
    ph: {
      id: 'ph', name: 'pH analyzer (glass electrode)',
      measures: 'ph', unit: 'pH', range: [0, 14], accuracy: '±0.1 pH',
      responseMs: 1500, costUsd: [300, 700, 1200], mtbfHours: 26000, calDays: 30,
      power: 'mains', protocol: '4-20mA', selfDiag: true,
      notes: 'Electrode ages and drifts; 30-day cal is real. Corrosion control depends on it.'
    },
    chlorine_residual: {
      id: 'chlorine_residual', name: 'Free chlorine analyzer (amperometric)',
      measures: 'chlorine', unit: 'mg/L', range: [0, 5], accuracy: '±0.05 mg/L',
      responseMs: 2000, costUsd: [1500, 2600, 3800], mtbfHours: 40000, calDays: 30,
      power: 'mains', protocol: '4-20mA / Modbus', selfDiag: true,
      notes: 'Disinfectant residual must stay >0.2 mg/L through the system; decays with time/heat.'
    },
    temperature_rtd: {
      id: 'temperature_rtd', name: 'Pipe/water temperature (PT100 RTD)',
      measures: 'temperature', unit: '°F', range: [-40, 250], accuracy: '±0.2°F',
      responseMs: 800, costUsd: [60, 150, 300], mtbfHours: 200000, calDays: 1825,
      power: 'loop', protocol: '4-20mA / Modbus', selfDiag: false,
      notes: 'Cheap, near-bulletproof. Freeze protection and treatment dosing both use it.'
    },
    freeze_probe: {
      id: 'freeze_probe', name: 'Freeze / ice-formation probe + heat-trace monitor',
      measures: 'freeze_risk', unit: '°F', range: [-40, 120], accuracy: '±0.5°F',
      responseMs: 1000, costUsd: [120, 300, 700], mtbfHours: 90000, calDays: 1825,
      power: 'mains', protocol: 'Modbus / dry contact', selfDiag: true,
      notes: 'Watches pipe-wall temp and heat-trace current; predicts ice before flow chokes.'
    },
    acoustic_leak: {
      id: 'acoustic_leak', name: 'Acoustic leak logger / correlator',
      measures: 'leak', unit: 'dB', range: [0, 100], accuracy: 'n/a (pattern)',
      responseMs: 1000, costUsd: [3000, 7000, 15000], mtbfHours: 60000, calDays: 730,
      power: 'battery', protocol: 'cellular', selfDiag: true,
      notes: 'Listens at night for the hiss of a leak; correlation pinpoints it within feet.'
    },
    pump_vibration: {
      id: 'pump_vibration', name: 'Pump vibration / bearing monitor',
      measures: 'vibration', unit: 'in/s', range: [0, 1], accuracy: '±2%',
      responseMs: 20, costUsd: [400, 900, 2000], mtbfHours: 100000, calDays: 1825,
      power: 'mains', protocol: 'Modbus / IEPE', selfDiag: true,
      notes: 'Rising RMS velocity = bearing wear/cavitation; predicts pump failure weeks out.'
    },
    motor_current: {
      id: 'motor_current', name: 'Pump motor current / power monitor',
      measures: 'current', unit: 'A', range: [0, 600], accuracy: '±0.5%',
      responseMs: 50, costUsd: [200, 500, 1200], mtbfHours: 150000, calDays: 1825,
      power: 'mains', protocol: 'Modbus', selfDiag: false,
      notes: 'Zero current = pump trip; high current = blockage/dry-run. Confirms the pump truly ran.'
    },
    valve_position: {
      id: 'valve_position', name: 'Valve position / PRV feedback',
      measures: 'position', unit: '%', range: [0, 100], accuracy: '±1%',
      responseMs: 200, costUsd: [300, 700, 1500], mtbfHours: 120000, calDays: 1825,
      power: 'mains', protocol: 'Modbus', selfDiag: false,
      notes: 'Confirms pressure-reducing valves and isolation valves are where SCADA commanded.'
    }
  };

  // ── Licensing tiers ──────────────────────────────────────────────────────
  // "Must-have" instruments ship out-of-the-box and run by default (base
  // license) — the system is never an empty slate. "Nice-to-have" and
  // "might-get" instruments are optional and require ADDITIONAL licensing.
  // One explicit list per tier; everything else is derived from it.
  const SENSOR_TIERS = {
    must: ['pressure_transducer', 'mag_flow', 'pd_meter', 'radar_level', 'turbidity', 'ph', 'chlorine_residual', 'temperature_rtd'],
    nice: ['ultrasonic_flow', 'submersible_level', 'freeze_probe', 'pump_vibration', 'motor_current', 'valve_position'],
    maybe: ['pressure_transient', 'acoustic_leak']
  };
  const TIER_META = {
    must: { key: 'must', label: 'Included — system must-have', license: 'Base license', optional: false, badge: '✓ Included' },
    nice: { key: 'nice', label: 'Nice-to-have', license: 'Add-on license', optional: true, badge: '🔒 License' },
    maybe: { key: 'maybe', label: 'Might-get — premium', license: 'Premium add-on license', optional: true, badge: '🔒 License' }
  };
  // Stamp the tier onto each catalog entry so callers can read sensor.tier directly.
  Object.keys(SENSOR_TIERS).forEach((t) => SENSOR_TIERS[t].forEach((id) => { if (SENSOR_CATALOG[id]) SENSOR_CATALOG[id].tier = t; }));

  function tierOf(id) { const s = SENSOR_CATALOG[id]; return s && s.tier ? s.tier : 'nice'; }
  function tierMeta(id) { return TIER_META[tierOf(id)]; }
  function isIncluded(id) { return tierOf(id) === 'must'; }            // out-of-the-box?
  function requiresLicense(id) { return tierOf(id) !== 'must'; }       // needs additional licensing?
  function defaultSensors() { return SENSOR_TIERS.must.slice(); }      // the out-of-the-box default set

  // Convenience: typical installed cost of one sensor.
  function typicalCost(id) { const s = SENSOR_CATALOG[id]; return s ? s.costUsd[1] : 0; }

  // Annualized failure probability from MTBF (for "monitor the monitors").
  function annualFailureRate(id) {
    const s = SENSOR_CATALOG[id];
    if (!s || !s.mtbfHours) return 0;
    return 1 - Math.exp(-8760 / s.mtbfHours);   // exponential reliability over 1 year
  }

  root.HM_SENSORS = {
    SENSOR_CATALOG, typicalCost, annualFailureRate,
    SENSOR_TIERS, TIER_META, tierOf, tierMeta, isIncluded, requiresLicense, defaultSensors
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HM_SENSORS;

}(typeof window !== 'undefined' ? window : globalThis));
