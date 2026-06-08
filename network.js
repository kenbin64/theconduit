/* ============================================================================
 * HydroManifold — Water-Network Schema (3D model source of truth)
 * ----------------------------------------------------------------------------
 * In a real deployment the 3D model BUILDS ITSELF from this schema as nodes come
 * online: provide the network (sources, treatment, pumps, tanks, mains, service
 * zones — each with a 3D position and its sensor stack) and the renderer lays it
 * out, wires the pipes, and drives every node's color from live sensor health.
 *
 * Coordinates: x = east(+) / west(−), y = elevation (ground = 0, up = +),
 *              z = north(+) / south(−).  Units are schematic.
 * ========================================================================== */
(function (root) {
  'use strict';

  // A simulated municipal network — source → treatment → boosters → tanks →
  // distribution mains → service zones, plus a backup well field. Each node maps
  // to a live simulator station (by index) so its color reflects real health.
  const SAMPLE = {
    name: 'Weber Basin — demonstration network',
    nodes: [
      { id: 'src', name: 'Pineview Source Reservoir', type: 'reservoir', pos: [-95, 26, -55], capacity: '110 BG', station: 0, sensors: ['radar_level', 'turbidity', 'ph', 'temperature_rtd'] },
      { id: 'well', name: 'Backup Well Field', type: 'well', pos: [-70, 0, 35], capacity: '4 MGD', station: 1, sensors: ['mag_flow', 'chlorine_residual'] },
      { id: 'wtp', name: 'Water Treatment Plant', type: 'treatment', pos: [-45, 6, -15], capacity: '30 MGD', station: 2, sensors: ['mag_flow', 'turbidity', 'chlorine_residual', 'ph'] },
      { id: 'bs1', name: 'Booster Station 1', type: 'pump', pos: [-8, 5, -8], capacity: '250 HP', station: 3, sensors: ['pressure_transducer', 'mag_flow', 'motor_current', 'pump_vibration'] },
      { id: 'jct', name: 'DMA-7 Junction', type: 'junction', pos: [18, 2, 4], station: 4, sensors: ['pressure_transducer', 'pressure_transient', 'acoustic_leak'] },
      { id: 'tankNE', name: 'NE Elevated Tank', type: 'tank_elevated', pos: [48, 34, -38], capacity: '2.0 MG', station: 5, sensors: ['radar_level', 'pressure_transducer', 'chlorine_residual'] },
      { id: 'bs2', name: 'Booster Station 2', type: 'pump', pos: [58, 5, 20], capacity: '180 HP', station: 6, sensors: ['pressure_transducer', 'mag_flow', 'motor_current'] },
      { id: 'tankSB', name: 'South Bench Ground Tank', type: 'tank_ground', pos: [40, 4, 52], capacity: '0.75 MG', station: 7, sensors: ['radar_level', 'chlorine_residual', 'temperature_rtd'] },
      { id: 'svcNE', name: 'NE Service Zone', type: 'service', pos: [85, 1, -28], capacity: '12k conn.', station: 8, sensors: ['pd_meter', 'pressure_transducer'] },
      { id: 'svcS', name: 'South Service Zone', type: 'service', pos: [72, 1, 56], capacity: '9k conn.', station: 9, sensors: ['pd_meter', 'pressure_transducer'] }
    ],
    pipes: [
      { from: 'src', to: 'wtp', diameter: 36 }, { from: 'well', to: 'wtp', diameter: 18 },
      { from: 'wtp', to: 'bs1', diameter: 30 }, { from: 'bs1', to: 'jct', diameter: 24 },
      { from: 'jct', to: 'tankNE', diameter: 20 }, { from: 'jct', to: 'bs2', diameter: 20 },
      { from: 'tankNE', to: 'svcNE', diameter: 16 }, { from: 'bs2', to: 'tankSB', diameter: 16 },
      { from: 'bs2', to: 'svcS', diameter: 16 }, { from: 'tankSB', to: 'svcS', diameter: 12 }
    ]
  };

  root.HM_NETWORK = { SAMPLE: SAMPLE };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HM_NETWORK;
}(typeof window !== 'undefined' ? window : globalThis));
