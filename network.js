/* ============================================================================
 * HydroManifold — Water-Network Schema (3D model source of truth)
 * ----------------------------------------------------------------------------
 * The 3D model BUILDS ITSELF from this schema. Node positions come from REAL
 * GPS (lat, lon) + ELEVATION — the same fields entered in the CMS — and are
 * resolved to local 3D coordinates (x = east, y = elevation, z = north) about
 * the network centroid. fromSupplies() builds a network straight from the CMS
 * "Water Supplies & Reservoirs" collection (gps + elevation + node type + which
 * supplies it connects to), so the model reflects what the operator entered.
 * ========================================================================== */
(function (root) {
  'use strict';

  function parseGps(s) { if (Array.isArray(s)) return { lat: +s[0] || 0, lon: +s[1] || 0 }; const m = String(s || '').split(','); return { lat: parseFloat(m[0]) || 0, lon: parseFloat(m[1]) || 0 }; }
  // equirectangular projection about an origin; elevation lifts y above the datum
  function geoToLocal(lat, lon, elev, o) { const KX = 950, latR = o.lat * Math.PI / 180; return [(lon - o.lon) * Math.cos(latR) * KX, (elev - o.elevMin) * 0.02, (lat - o.lat) * KX]; }
  // fill node.pos from gps + elevation (about the centroid of all geo-located nodes)
  function resolvePositions(net) {
    const geo = (net.nodes || []).filter((n) => n.gps);
    if (geo.length) {
      let slat = 0, slon = 0, emin = Infinity;
      geo.forEach((n) => { const g = parseGps(n.gps); slat += g.lat; slon += g.lon; emin = Math.min(emin, n.elevation != null ? n.elevation : 0); });
      const o = { lat: slat / geo.length, lon: slon / geo.length, elevMin: isFinite(emin) ? emin : 0 };
      net.nodes.forEach((n) => { if (n.gps) { const g = parseGps(n.gps); n.pos = geoToLocal(g.lat, g.lon, n.elevation != null ? n.elevation : o.elevMin, o); } else if (!n.pos) n.pos = [0, 0, 0]; });
    } else net.nodes.forEach((n) => { if (!n.pos) n.pos = [0, 0, 0]; });
    return net;
  }

  const SENSORS_BY_TYPE = {
    reservoir: ['radar_level', 'turbidity', 'ph', 'temperature_rtd'], tank_elevated: ['radar_level', 'pressure_transducer', 'chlorine_residual'],
    tank_ground: ['radar_level', 'chlorine_residual', 'temperature_rtd'], pump: ['pressure_transducer', 'mag_flow', 'motor_current', 'pump_vibration'],
    treatment: ['mag_flow', 'turbidity', 'chlorine_residual', 'ph'], well: ['mag_flow', 'chlorine_residual'],
    junction: ['pressure_transducer', 'pressure_transient', 'acoustic_leak'], service: ['pd_meter', 'pressure_transducer'],
    building: ['pressure_transducer', 'radar_level'], dam: ['radar_level', 'pressure_transducer'], machine: ['mag_flow', 'pressure_transducer', 'motor_current']
  };
  // map a CMS water-supply row → a 3D node type
  function nodeType3d(row) {
    if (row.nodeType) return row.nodeType;
    const st = String(row.storage || '').toLowerCase(), cl = String(row.classification || '').toLowerCase();
    if (/elevated|high/.test(st)) return 'tank_elevated'; if (/ground|buried/.test(st)) return 'tank_ground';
    if (/reservoir/.test(st) || /surface/.test(cl)) return 'reservoir'; if (row.source === 'well / pumped-in' || /well/.test(String(row.source))) return 'well';
    return 'tank_ground';
  }
  function fmtGal(g) { g = +g || 0; return g >= 1e9 ? (g / 1e9).toFixed(1) + ' BG' : g >= 1e6 ? (g / 1e6).toFixed(2) + ' MG' : g.toLocaleString() + ' gal'; }

  // Build a network from CMS "water_supplies" rows (gps + elevation + connectsTo).
  function fromSupplies(supplies) {
    const nodes = (supplies || []).filter((s) => s.gps).map((s, i) => { const ty = nodeType3d(s); return { id: s._id || ('n' + i), name: s.name, type: ty, gps: s.gps, elevation: parseFloat(s.elevation) || 4500, capacity: s.capacityGal ? fmtGal(s.capacityGal) : undefined, station: i, sensors: SENSORS_BY_TYPE[ty] || ['pressure_transducer'] }; });
    const byName = {}, byId = {}; nodes.forEach((n) => { byName[n.name] = n.id; byId[n.id] = n.id; });
    const pipes = [];
    (supplies || []).forEach((s, i) => { if (!nodes[i]) return; String(s.connectsTo || '').split(',').map((x) => x.trim()).filter(Boolean).forEach((t) => { const to = byId[t] || byName[t]; if (to && to !== nodes[i].id) pipes.push({ from: nodes[i].id, to: to, diameter: 16 }); }); });
    return resolvePositions({ name: 'From CMS — water supplies', nodes: nodes, pipes: pipes });
  }

  // ── simulated demonstration network: positions from real GPS + elevation ──
  const SAMPLE = resolvePositions({
    name: 'Weber Basin — demonstration network',
    nodes: [
      { id: 'src', name: 'Pineview Source Reservoir', type: 'reservoir', gps: '41.262, -112.005', elevation: 5180, capacity: '110 BG', station: 0, sensors: SENSORS_BY_TYPE.reservoir },
      { id: 'well', name: 'Backup Well Field', type: 'well', gps: '41.178, -111.882', elevation: 4520, capacity: '4 MGD', station: 1, sensors: SENSORS_BY_TYPE.well },
      { id: 'wtp', name: 'Water Treatment Plant', type: 'treatment', gps: '41.232, -111.962', elevation: 4720, capacity: '30 MGD', station: 2, sensors: SENSORS_BY_TYPE.treatment },
      { id: 'bs1', name: 'Booster Station 1', type: 'pump', gps: '41.214, -111.922', elevation: 4660, capacity: '250 HP', station: 3, sensors: SENSORS_BY_TYPE.pump },
      { id: 'jct', name: 'DMA-7 Junction', type: 'junction', gps: '41.205, -111.902', elevation: 4615, station: 4, sensors: SENSORS_BY_TYPE.junction },
      { id: 'tankNE', name: 'NE Elevated Tank', type: 'tank_elevated', gps: '41.241, -111.861', elevation: 5060, capacity: '2.0 MG', station: 5, sensors: SENSORS_BY_TYPE.tank_elevated },
      { id: 'bs2', name: 'Booster Station 2', type: 'pump', gps: '41.191, -111.872', elevation: 4640, capacity: '180 HP', station: 6, sensors: SENSORS_BY_TYPE.pump },
      { id: 'tankSB', name: 'South Bench Ground Tank', type: 'tank_ground', gps: '41.172, -111.892', elevation: 4880, capacity: '0.75 MG', station: 7, sensors: SENSORS_BY_TYPE.tank_ground },
      { id: 'svcNE', name: 'NE Service Zone', type: 'service', gps: '41.231, -111.831', elevation: 4585, capacity: '12k conn.', station: 8, sensors: SENSORS_BY_TYPE.service },
      { id: 'svcS', name: 'South Service Zone', type: 'service', gps: '41.161, -111.852', elevation: 4560, capacity: '9k conn.', station: 9, sensors: SENSORS_BY_TYPE.service }
    ],
    pipes: [
      { from: 'src', to: 'wtp', diameter: 36 }, { from: 'well', to: 'wtp', diameter: 18 }, { from: 'wtp', to: 'bs1', diameter: 30 }, { from: 'bs1', to: 'jct', diameter: 24 },
      { from: 'jct', to: 'tankNE', diameter: 20 }, { from: 'jct', to: 'bs2', diameter: 20 }, { from: 'tankNE', to: 'svcNE', diameter: 16 }, { from: 'bs2', to: 'tankSB', diameter: 16 },
      { from: 'bs2', to: 'svcS', diameter: 16 }, { from: 'tankSB', to: 'svcS', diameter: 12 }
    ]
  });

  // ── Preset systems: pick what kind of system to simulate and 3D-diagram ──────
  // Each node has an explicit pos [x=east, y=height/elevation, z=north] so the
  // diagram is designed, not GPS-derived. station indexes into the live sim.
  function _mkPreset(name, defs, pipeDefs) {
    const nodes = defs.map((d, i) => ({
      id: d[0], name: d[1], type: d[2], pos: d[3].slice(), station: i, capacity: d[4],
      sensors: SENSORS_BY_TYPE[d[2]] || ['pressure_transducer'],
    }));
    const pipes = pipeDefs.map((p) => ({ from: p[0], to: p[1], diameter: p[2] || 16 }));
    return { name: name, nodes: nodes, pipes: pipes };
  }

  const PRESETS = {
    municipal: _mkPreset('Municipal water system', [
      ['src', 'Mountain Reservoir', 'reservoir', [-72, 30, -42], '110 BG'],
      ['dam', 'Diversion Dam', 'dam', [-52, 20, -40]],
      ['well', 'Backup Well Field', 'well', [-44, 2, 28], '4 MGD'],
      ['wtp', 'Water Treatment Plant', 'treatment', [-26, 8, -16], '30 MGD'],
      ['bs1', 'Booster Station', 'pump', [-6, 6, -2], '250 HP'],
      ['jct', 'DMA Junction', 'junction', [6, 5, 10]],
      ['tankE', 'Elevated Tank', 'tank_elevated', [26, 40, 18], '2 MG'],
      ['tankG', 'Ground Tank', 'tank_ground', [10, 6, 36], '0.75 MG'],
      ['svcN', 'North Service Zone', 'service', [48, 4, 30], '12k conn'],
      ['svcS', 'South Service Zone', 'service', [36, 4, -26], '9k conn'],
    ], [
      ['src', 'dam', 36], ['dam', 'wtp', 30], ['well', 'wtp', 18], ['wtp', 'bs1', 30],
      ['bs1', 'jct', 24], ['jct', 'tankE', 20], ['jct', 'tankG', 18], ['tankE', 'svcN', 16],
      ['tankG', 'svcS', 12], ['jct', 'svcS', 16],
    ]),
    dam: _mkPreset('Dam & reservoir system', [
      ['res', 'Main Reservoir', 'reservoir', [-54, 34, 0], '500 BG'],
      ['intake', 'Intake Tower', 'well', [-40, 16, -16]],
      ['dam', 'Dam', 'dam', [-26, 22, 0]],
      ['spill', 'Spillway', 'junction', [-26, 9, 26]],
      ['power', 'Powerhouse', 'machine', [-4, 8, 2], '200 MW'],
      ['canal', 'Irrigation Canal', 'junction', [16, 7, -22]],
      ['river', 'Downstream River', 'service', [34, 3, 12]],
    ], [
      ['res', 'intake', 40], ['intake', 'power', 30], ['power', 'river', 30],
      ['dam', 'spill', 24], ['spill', 'river', 20], ['res', 'canal', 24],
    ]),
    treatment: _mkPreset('Water treatment plant', [
      ['intake', 'Raw Water Intake', 'well', [-72, 6, 0]],
      ['screen', 'Screening', 'machine', [-54, 6, 0]],
      ['coag', 'Coagulation', 'treatment', [-36, 6, 8]],
      ['sed', 'Sedimentation', 'tank_ground', [-16, 6, -8]],
      ['filt', 'Filtration', 'treatment', [2, 6, 8]],
      ['disinf', 'Disinfection', 'machine', [20, 6, -8]],
      ['clear', 'Clearwell', 'tank_ground', [38, 6, 4], '5 MG'],
      ['hsp', 'High-Service Pumps', 'pump', [56, 6, -4]],
      ['dist', 'Distribution', 'service', [74, 5, 0]],
    ], [
      ['intake', 'screen', 30], ['screen', 'coag', 30], ['coag', 'sed', 24], ['sed', 'filt', 24],
      ['filt', 'disinf', 24], ['disinf', 'clear', 24], ['clear', 'hsp', 20], ['hsp', 'dist', 20],
    ]),
    sewer: _mkPreset('Sewer / wastewater system', [
      ['svcA', 'Collection Zone A', 'service', [-62, 18, -22]],
      ['svcB', 'Collection Zone B', 'service', [-56, 16, 26]],
      ['mh1', 'Manhole Junction', 'junction', [-36, 12, 0]],
      ['mh2', 'Trunk Junction', 'junction', [-14, 9, 10]],
      ['lift', 'Lift Station', 'pump', [2, 6, -6]],
      ['inter', 'Interceptor', 'junction', [20, 5, 6]],
      ['wwtp', 'Wastewater Plant', 'treatment', [40, 4, 0], '40 MGD'],
      ['clar', 'Clarifier', 'tank_ground', [56, 4, 12]],
      ['outfall', 'Outfall', 'well', [72, 2, -8]],
    ], [
      ['svcA', 'mh1', 18], ['svcB', 'mh2', 18], ['mh1', 'mh2', 24], ['mh2', 'lift', 24],
      ['lift', 'inter', 30], ['inter', 'wwtp', 30], ['wwtp', 'clar', 24], ['clar', 'outfall', 24],
    ]),
    skyscraper: _mkPreset('Skyscraper water system', [
      ['bldg', 'Tower', 'building', [2, 0, -20]],
      ['main', 'City Main Intake', 'well', [-2, 2, 2]],
      ['bpump', 'Basement Pumps', 'pump', [-2, 8, 10]],
      ['lowT', 'Low-Zone Break Tank', 'tank_ground', [-16, 16, 2]],
      ['riser', 'Riser', 'junction', [-2, 28, 2]],
      ['midT', 'Mid-Zone Tank', 'tank_elevated', [14, 42, 2]],
      ['mpump', 'Mid Booster', 'pump', [-2, 48, 10]],
      ['roofT', 'Roof Tank', 'tank_elevated', [-2, 70, 2], '50k gal'],
      ['zLow', 'Floors 1-20', 'service', [-22, 18, 12]],
      ['zMid', 'Floors 21-40', 'service', [22, 44, -10]],
      ['zHigh', 'Floors 41-60', 'service', [-16, 66, -8]],
    ], [
      ['main', 'bpump', 12], ['bpump', 'lowT', 10], ['lowT', 'riser', 10], ['riser', 'midT', 8],
      ['midT', 'mpump', 8], ['mpump', 'roofT', 8], ['roofT', 'zHigh', 6], ['midT', 'zMid', 6], ['lowT', 'zLow', 6],
    ]),
    factory: _mkPreset('Factory / industrial', [
      ['intake', 'Raw Water Intake', 'well', [-60, 6, 0]],
      ['pre', 'Pretreatment', 'treatment', [-42, 6, 10]],
      ['proc1', 'Process Unit 1', 'machine', [-22, 8, -6]],
      ['proc2', 'Process Unit 2', 'machine', [-22, 8, 16]],
      ['cool', 'Cooling Tower', 'tank_ground', [0, 6, 2]],
      ['recyc', 'Recycle Tank', 'tank_ground', [18, 6, -12]],
      ['wwt', 'Effluent Treatment', 'treatment', [38, 5, 8]],
      ['disch', 'Permitted Discharge', 'well', [58, 3, 0]],
    ], [
      ['intake', 'pre', 24], ['pre', 'proc1', 18], ['pre', 'proc2', 18], ['proc1', 'cool', 16],
      ['proc2', 'cool', 16], ['cool', 'recyc', 16], ['recyc', 'proc1', 12], ['cool', 'wwt', 18], ['wwt', 'disch', 18],
    ]),
  };

  // Return a fresh clone so switching presets never mutates the source.
  function getPreset(key) {
    if (key === 'sample' || !PRESETS[key]) return SAMPLE;
    return JSON.parse(JSON.stringify(PRESETS[key]));
  }

  root.HM_NETWORK = { SAMPLE: SAMPLE, PRESETS: PRESETS, getPreset: getPreset, resolvePositions: resolvePositions, fromSupplies: fromSupplies, geoToLocal: geoToLocal, SENSORS_BY_TYPE: SENSORS_BY_TYPE };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HM_NETWORK;
}(typeof window !== 'undefined' ? window : globalThis));
