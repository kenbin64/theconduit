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
    junction: ['pressure_transducer', 'pressure_transient', 'acoustic_leak'], service: ['pd_meter', 'pressure_transducer']
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

  root.HM_NETWORK = { SAMPLE: SAMPLE, resolvePositions: resolvePositions, fromSupplies: fromSupplies, geoToLocal: geoToLocal, SENSORS_BY_TYPE: SENSORS_BY_TYPE };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HM_NETWORK;
}(typeof window !== 'undefined' ? window : globalThis));
