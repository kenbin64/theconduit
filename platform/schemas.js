/* ============================================================================
 * HydroManifold Platform — Domain schemas + seed data
 * ----------------------------------------------------------------------------
 * Each entry is a self-contained module the registry engine turns into a
 * working CRUD + CSV view. The breadth here is the point: compliance, assets,
 * procurement, risk, finance, operations, security, data governance,
 * environmental, insurance, personnel. Adding another jurisdiction or domain is
 * just another schema — no new code. Seed data is realistic (real citations).
 * ========================================================================== */
(function (root) {
  'use strict';
  const sel = (...o) => o;

  const COLLECTIONS = [
    // ── COMPLIANCE / CMS (regulations are data, enterable by human or AI) ──
    {
      id: 'regulations', name: 'Regulations (CMS)', icon: '⚖️', group: 'Compliance', compliance: true,
      desc: 'Every federal/state/local/industry rule as data. Linked to live monitoring for real-time compliance.',
      schema: [
        { key: 'level', label: 'Level', type: 'select', options: sel('Federal', 'State', 'County', 'Local/City', 'Industry') },
        { key: 'citation', label: 'Citation' }, { key: 'title', label: 'Requirement' },
        { key: 'authority', label: 'Authority' },
        { key: 'parameter', label: 'Parameter', type: 'select', options: sel('turbidity', 'chlorine', 'pressure', 'ph', 'temperature', 'none') },
        { key: 'op', label: 'Test', type: 'select', options: sel('<=', '>=', '=', 'range', 'n/a') },
        { key: 'threshold', label: 'Limit', type: 'number' }, { key: 'unit', label: 'Unit' },
        { key: 'status', label: 'Status', type: 'select', options: sel('active', 'pending', 'superseded') },
        { key: 'source', label: 'Entered by', type: 'select', options: sel('human', 'AI-assist') },
        { key: 'effective', label: 'Effective', type: 'date' }
      ],
      seed: [
        { level: 'Federal', citation: '40 CFR 141.13', title: 'Combined filter effluent turbidity ≤ 0.3 NTU (95% of samples)', authority: 'EPA SDWA', parameter: 'turbidity', op: '<=', threshold: 0.3, unit: 'NTU', status: 'active', source: 'human', effective: '2002-01-01' },
        { level: 'Federal', citation: '40 CFR 141.72', title: 'Detectable disinfectant residual in distribution', authority: 'EPA SDWA', parameter: 'chlorine', op: '>=', threshold: 0.2, unit: 'mg/L', status: 'active', source: 'human', effective: '2002-01-01' },
        { level: 'Federal', citation: '40 CFR 141.80', title: 'Lead action level 0.015 mg/L (Lead & Copper Rule)', authority: 'EPA', parameter: 'none', op: '<=', threshold: 0.015, unit: 'mg/L', status: 'active', source: 'human', effective: '1991-12-07' },
        { level: 'Federal', citation: '40 CFR 141.64', title: 'Stage 2 DBPR — TTHM ≤ 0.080 mg/L (LRAA)', authority: 'EPA', parameter: 'none', op: '<=', threshold: 0.08, unit: 'mg/L', status: 'active', source: 'human', effective: '2012-04-01' },
        { level: 'State', citation: 'State WSR R309-105', title: 'Minimum distribution pressure ≥ 20 psi under all conditions', authority: 'State DDW', parameter: 'pressure', op: '>=', threshold: 20, unit: 'psi', status: 'active', source: 'human', effective: '2015-07-01' },
        { level: 'State', citation: 'State R309-200', title: 'Finished water pH within corrosion-control range 7.0–8.5', authority: 'State DDW', parameter: 'ph', op: 'range', threshold: 7.0, unit: 'pH', status: 'active', source: 'AI-assist', effective: '2018-01-01' },
        { level: 'Local/City', citation: 'Muni Code 13.04', title: 'Backflow / cross-connection assemblies tested annually', authority: 'City Utility', parameter: 'none', op: 'n/a', threshold: 0, unit: '', status: 'active', source: 'human', effective: '2010-01-01' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'compliance_officer'] }
    },

    // ── ASSETS ──
    {
      id: 'equipment', name: 'Equipment Inventory', icon: '🔧', group: 'Assets',
      desc: 'Physical asset register with condition, criticality, and service schedule (degradation tracking).',
      schema: [
        { key: 'tag', label: 'Asset tag' }, { key: 'type', label: 'Type' }, { key: 'location', label: 'Location' },
        { key: 'manufacturer', label: 'Mfr' }, { key: 'model', label: 'Model' }, { key: 'installed', label: 'Installed', type: 'date' },
        { key: 'conditionPct', label: 'Condition %', type: 'number' },
        { key: 'criticality', label: 'Criticality', type: 'select', options: sel('low', 'medium', 'high', 'critical') },
        { key: 'status', label: 'Status', type: 'select', options: sel('in-service', 'standby', 'down', 'retired') },
        { key: 'nextService', label: 'Next service', type: 'date' }
      ],
      seed: [
        { tag: 'PMP-BS1-A', type: 'Vertical turbine pump 250 HP', location: 'Booster Stn 1', manufacturer: 'Flowserve', model: 'VTP-12', installed: '2016-05-10', conditionPct: 78, criticality: 'high', status: 'in-service', nextService: '2026-08-01' },
        { tag: 'PMP-BS1-B', type: 'Vertical turbine pump 250 HP', location: 'Booster Stn 1', manufacturer: 'Flowserve', model: 'VTP-12', installed: '2016-05-10', conditionPct: 62, criticality: 'high', status: 'standby', nextService: '2026-07-15' },
        { tag: 'FM-WTP-IN', type: 'Mag flow meter 24"', location: 'WTP influent', manufacturer: 'Endress+Hauser', model: 'Promag W', installed: '2019-03-22', conditionPct: 91, criticality: 'medium', status: 'in-service', nextService: '2027-01-01' },
        { tag: 'CL2-WTP', type: 'Free chlorine analyzer', location: 'WTP clearwell', manufacturer: 'Hach', model: 'CLF10sc', installed: '2021-09-01', conditionPct: 55, criticality: 'critical', status: 'in-service', nextService: '2026-06-20' },
        { tag: 'TANK-NE', type: 'Elevated storage 2.0 MG', location: 'NE pressure zone', manufacturer: 'CB&I', model: 'Hydropillar', installed: '2008-11-01', conditionPct: 70, criticality: 'high', status: 'in-service', nextService: '2026-10-01' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'engineer'] }
    },

    // ── INSPECTIONS & TEST RESULTS (public records; gov takes precedence) ──
    {
      id: 'inspections', name: 'Inspections & Test Results', icon: '🔬', group: 'Compliance',
      desc: 'Municipal, government and private inspection & laboratory results, including public records. Government sources take precedence; non-government sources must be credentialed, sourced and auditable.',
      schema: [
        { key: 'subject', label: 'Subject / supply', required: true },
        { key: 'test', label: 'Test / inspection' },
        { key: 'result', label: 'Result' },
        { key: 'unit', label: 'Unit' },
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'sourceType', label: 'Source type', type: 'select', options: sel('federal government', 'state government', 'municipal government', 'accredited lab', 'private', 'citizen') },
        { key: 'precedence', label: 'Precedence', type: 'select', options: sel('primary (government)', 'secondary (non-gov)') },
        { key: 'public', label: 'Public record', type: 'select', options: sel('yes', 'no') },
        { key: 'credential', label: 'Credential / accreditation' },
        { key: 'sourceRef', label: 'Source (URL / citation)', type: 'url' },
        { key: 'status', label: 'Status', type: 'select', options: sel('verified', 'unverified', 'disputed', 'superseded') }
      ],
      seed: [
        { subject: 'NE Pressure-Zone Reservoir', test: 'Total coliform (RTCR)', result: 'Absent', unit: 'P/A', date: '2026-05-28', sourceType: 'state government', precedence: 'primary (government)', public: 'yes', credential: 'State DDW lab #UT00123', sourceRef: 'https://echo.epa.gov', status: 'verified' },
        { subject: 'WTP finished water', test: 'Lead & copper (90th pct)', result: '0.004', unit: 'mg/L', date: '2026-05-15', sourceType: 'accredited lab', precedence: 'secondary (non-gov)', public: 'yes', credential: 'NELAP cert #UT-4471 (accredited)', sourceRef: 'https://lab.example/report/4471', status: 'verified' },
        { subject: 'South Bench Ground Tank', test: 'Disinfection byproducts (TTHM)', result: '0.042', unit: 'mg/L', date: '2026-04-30', sourceType: 'municipal government', precedence: 'primary (government)', public: 'yes', credential: 'City Utility lab', sourceRef: 'https://city.example/water/ccr', status: 'verified' },
        { subject: 'Secondary Irrigation Pond', test: 'Visual / turbidity grab', result: '12', unit: 'NTU', date: '2026-06-04', sourceType: 'private', precedence: 'secondary (non-gov)', public: 'no', credential: 'Contractor — credential pending', sourceRef: '', status: 'unverified' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'compliance_officer', 'engineer', 'regulator'] }
    },

    // ── DATA FEEDS & PUBLIC APIs ──
    {
      id: 'data_feeds', name: 'Data Feeds & Public APIs', icon: '🔌', group: 'Operations',
      desc: 'Connections to public APIs and data sources for telemetry and inspector reports. Government feeds take precedence; non-government feeds must be sourced, credentialed and auditable.',
      schema: [
        { key: 'name', label: 'Feed name', required: true },
        { key: 'provider', label: 'Provider' },
        { key: 'sourceType', label: 'Source type', type: 'select', options: sel('federal government', 'state government', 'municipal government', 'accredited lab', 'private', 'citizen') },
        { key: 'dataType', label: 'Data type', type: 'select', options: sel('water quality', 'inspection reports', 'weather', 'streamflow / USGS', 'drought', 'advisories', 'other') },
        { key: 'endpoint', label: 'Endpoint (URL)', type: 'url' },
        { key: 'precedence', label: 'Precedence', type: 'select', options: sel('primary (government)', 'secondary (non-gov)') },
        { key: 'credential', label: 'Credential / API key ref' },
        { key: 'auth', label: 'Auth method', type: 'select', options: sel('none (open data)', 'API key', 'OAuth', 'mTLS') },
        { key: 'cadence', label: 'Refresh', type: 'select', options: sel('real-time', 'hourly', 'daily', 'weekly', 'on-demand') },
        { key: 'auditable', label: 'Auditable', type: 'select', options: sel('yes', 'no') },
        { key: 'status', label: 'Status', type: 'select', options: sel('connected', 'degraded', 'disconnected', 'pending') }
      ],
      seed: [
        { name: 'EPA ECHO / SDWIS', provider: 'US EPA', sourceType: 'federal government', dataType: 'inspection reports', endpoint: 'https://echo.epa.gov/tools/web-services', precedence: 'primary (government)', credential: 'open data (gov)', auth: 'none (open data)', cadence: 'daily', auditable: 'yes', status: 'connected' },
        { name: 'USGS Water Services', provider: 'US Geological Survey', sourceType: 'federal government', dataType: 'streamflow / USGS', endpoint: 'https://waterservices.usgs.gov', precedence: 'primary (government)', credential: 'open data (gov)', auth: 'none (open data)', cadence: 'hourly', auditable: 'yes', status: 'connected' },
        { name: 'NWS / NOAA weather', provider: 'National Weather Service', sourceType: 'federal government', dataType: 'weather', endpoint: 'https://api.weather.gov', precedence: 'primary (government)', credential: 'open data (gov)', auth: 'none (open data)', cadence: 'hourly', auditable: 'yes', status: 'connected' },
        { name: 'US Drought Monitor', provider: 'NDMC / USDA / NOAA', sourceType: 'federal government', dataType: 'drought', endpoint: 'https://droughtmonitor.unl.edu', precedence: 'primary (government)', credential: 'open data (gov)', auth: 'none (open data)', cadence: 'weekly', auditable: 'yes', status: 'connected' },
        { name: 'Contract lab LIMS feed', provider: 'Regional Lab Inc. (NELAP)', sourceType: 'accredited lab', dataType: 'water quality', endpoint: 'https://lab.example/api', precedence: 'secondary (non-gov)', credential: 'NELAP cert #UT-4471 · API key in KMS', auth: 'API key', cadence: 'daily', auditable: 'yes', status: 'connected' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'engineer', 'compliance_officer'] }
    },

    // ── WATER SUPPLIES, TANKS & RESERVOIRS ──
    {
      id: 'water_supplies', name: 'Water Supplies & Reservoirs', icon: '🚰', group: 'Assets',
      desc: 'Every source, tank and reservoir — classification, potability, chemistry, capacity, siting (GPS), evaporation loss and firefighting availability.',
      schema: [
        { key: 'name', label: 'Supply / reservoir name', required: true },
        { key: 'classification', label: 'Classification', type: 'select', options: sel('potable', 'safe for drinking', 'irrigation', 'raw / untreated', 'reclaimed', 'sewer / wastewater', 'contaminated') },
        { key: 'potable', label: 'Safe to drink', type: 'select', options: sel('yes', 'no', 'boil-order', 'unknown') },
        { key: 'chlorine', label: 'Chlorine (mg/L)', type: 'number' },
        { key: 'mineralsPpm', label: 'Minerals / TDS (ppm)', type: 'number' },
        { key: 'storage', label: 'Storage type', type: 'select', options: sel('reservoir', 'elevated (high) tank', 'ground tank', 'buried tank', 'standpipe', 'none (direct feed)') },
        { key: 'capacityGal', label: 'Capacity (gallons)', type: 'number' },
        { key: 'composition', label: 'Tank composition', type: 'select', options: sel('welded steel', 'bolted steel', 'concrete', 'prestressed concrete', 'polyethylene', 'fiberglass', 'earthen / lined') },
        { key: 'source', label: 'Source', type: 'select', options: sel('tributary / surface', 'well / pumped-in', 'purchased / imported', 'spring', 'recycled') },
        { key: 'evapLossGalDay', label: 'Evaporation loss (gal/day)', type: 'number' },
        { key: 'gps', label: 'GPS (lat, lon)' },
        { key: 'fireUse', label: 'Firefighting divertable', type: 'select', options: sel('yes', 'no', 'emergency-only') },
        { key: 'status', label: 'Status', type: 'select', options: sel('in-service', 'standby', 'offline', 'quarantined') }
      ],
      seed: [
        { name: 'NE Pressure-Zone Reservoir', classification: 'potable', potable: 'yes', chlorine: 0.9, mineralsPpm: 320, storage: 'elevated (high) tank', capacityGal: 2000000, composition: 'welded steel', source: 'well / pumped-in', evapLossGalDay: 0, gps: '41.2230, -111.9738', fireUse: 'yes', status: 'in-service' },
        { name: 'Pineview Source Reservoir', classification: 'raw / untreated', potable: 'no', chlorine: 0, mineralsPpm: 140, storage: 'reservoir', capacityGal: 110000000000, composition: 'earthen / lined', source: 'tributary / surface', evapLossGalDay: 850000, gps: '41.2585, -111.8430', fireUse: 'emergency-only', status: 'in-service' },
        { name: 'South Bench Ground Tank', classification: 'potable', potable: 'yes', chlorine: 0.7, mineralsPpm: 290, storage: 'ground tank', capacityGal: 750000, composition: 'prestressed concrete', source: 'purchased / imported', evapLossGalDay: 0, gps: '41.1902, -111.9510', fireUse: 'yes', status: 'in-service' },
        { name: 'Secondary Irrigation Pond', classification: 'irrigation', potable: 'no', chlorine: 0, mineralsPpm: 210, storage: 'reservoir', capacityGal: 5200000, composition: 'earthen / lined', source: 'tributary / surface', evapLossGalDay: 42000, gps: '41.1755, -112.0240', fireUse: 'emergency-only', status: 'in-service' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'engineer', 'operator'] }
    },

    // ── PUBLIC REPORTS (citizen-reported issues) ──
    {
      id: 'public_reports', name: 'Public Reports', icon: '📣', group: 'Operations',
      desc: 'Citizen-reported issues — visible damage, trespassing, criminal activity, dead animals, visual contamination — triaged, located and tracked to resolution.',
      schema: [
        { key: 'type', label: 'Report type', type: 'select', options: sel('visible damage', 'trespassing', 'criminal activity', 'dead animal in supply', 'visual contaminant', 'illegal dumping', 'taste / odor', 'other') },
        { key: 'supply', label: 'Water supply / location' },
        { key: 'gps', label: 'GPS (lat, lon)' },
        { key: 'reporter', label: 'Reported by' },
        { key: 'reported', label: 'Reported', type: 'date' },
        { key: 'severity', label: 'Severity', type: 'select', options: sel('low', 'medium', 'high', 'critical') },
        { key: 'status', label: 'Status', type: 'select', options: sel('new', 'investigating', 'dispatched', 'resolved', 'unfounded') },
        { key: 'notes', label: 'Details', type: 'textarea' }
      ],
      seed: [
        { type: 'dead animal in supply', supply: 'Secondary Irrigation Pond', gps: '41.1755, -112.0240', reporter: 'Public hotline', reported: '2026-06-05', severity: 'high', status: 'investigating', notes: 'Caller reports a deer carcass at the north inlet; sample dispatched.' },
        { type: 'trespassing', supply: 'NE Pressure-Zone Reservoir', gps: '41.2230, -111.9738', reporter: 'Neighbor', reported: '2026-06-06', severity: 'medium', status: 'dispatched', notes: 'Fence cut on east side; security en route.' },
        { type: 'visual contaminant', supply: 'South Bench Ground Tank', gps: '41.1902, -111.9510', reporter: 'Resident', reported: '2026-06-07', severity: 'high', status: 'new', notes: 'Cloudy water at tap reported by three households on the bench.' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'operator', 'compliance_officer', 'security_officer'] }
    },

    // ── COMPONENT ONBOARDING (documentation-as-implementation) ──
    // A new component is added by INGESTING authorized documentation — via link,
    // scanned/pasted text, or file transfer. The record is signed & sealed on
    // ingest; it is "approved for use" only when the required (*) evidence exists.
    {
      id: 'components', name: 'Component Onboarding', icon: '🧩', group: 'Assets',
      desc: 'Add a new component by INGESTING authorized documentation — by link, scanned/pasted text, or file transfer. Sealed on ingest; approved for use only when required (*) evidence is complete.',
      schema: [
        { key: 'name', label: 'Component', required: true },
        { key: 'category', label: 'Category', type: 'select', options: sel('sensor', 'pump', 'valve', 'analyzer', 'meter', 'controller', 'other') },
        { key: 'sensorClass', label: 'Sensor class (catalog id)', type: 'select', options: sel('—', 'pressure_transducer', 'mag_flow', 'pd_meter', 'radar_level', 'turbidity', 'ph', 'chlorine_residual', 'temperature_rtd', 'ultrasonic_flow', 'submersible_level', 'freeze_probe', 'pump_vibration', 'motor_current', 'valve_position', 'pressure_transient', 'acoustic_leak') },
        { key: 'dataSource', label: 'Data source', type: 'select', options: sel('sample (canned)', 'live — API', 'live — file', 'live — manual') },
        { key: 'manufacturer', label: 'Manufacturer (authorized)', required: true },
        { key: 'model', label: 'Model' },
        { key: 'candidateSystem', label: 'Approved for system', type: 'select', options: sel('home', 'commercial', 'municipal', 'regional', 'all') },
        { key: 'source', label: 'Provenance (how entered)', type: 'select', options: sel('official documentation', 'file transfer', 'API link') },
        { key: 'mfrAuth', label: 'Manufacturer authorization', type: 'file', required: true },
        { key: 'compliance', label: 'Compliance docs (NSF/ANSI 61, AWWA, FIPS…)', type: 'textarea', required: true },
        { key: 'nsf61', label: 'NSF/ANSI/CAN 61 (health effects)', type: 'select', options: sel('yes', 'no', 'n/a') },
        { key: 'nsf372', label: 'NSF/ANSI/CAN 372 (lead content / "lead free")', type: 'select', options: sel('yes', 'no', 'n/a') },
        { key: 'method', label: 'Approved analytical method (compliance instruments)' },
        { key: 'calibratedOn', label: 'Last calibrated', type: 'date' },
        { key: 'calDays', label: 'Calibration interval (days)', type: 'number' },
        { key: 'license', label: 'License / certification', type: 'file', required: true },
        { key: 'proofOfSale', label: 'Proof of sale (PO / invoice #)', required: true },
        { key: 'manualLink', label: 'Manual / documentation link', type: 'url', required: true },
        { key: 'engSpecs', label: 'Engineering specs', type: 'textarea', required: true },
        { key: 'regCitations', label: 'Regulatory citations', type: 'textarea', required: true },
        { key: 'approvedForUse', label: 'Approved for use', type: 'select', options: sel('pending', 'yes', 'no') },
        { key: 'status', label: 'Status', type: 'select', options: sel('draft', 'submitted', 'verified', 'approved') }
      ],
      // The 8 must-have base-tier sensors are standard and known beforehand, so
      // they are pre-loaded by default (editable only with proper change authority).
      // Compliance instruments (turbidity, pH, chlorine) carry NSF/ANSI 61 & 372,
      // an EPA-approved method, and a current calibration; operational instruments
      // need provenance but not a compliance method.
      seed: [
        { name: 'Pressure transducer', sensorClass: 'pressure_transducer', category: 'sensor', manufacturer: 'Rosemount', model: '2088', candidateSystem: 'all', source: 'official documentation', mfrAuth: 'file: rosemount-2088-auth.pdf · transferred & sealed', compliance: 'NSF/ANSI/CAN 61 & 372 (wetted 316SS)', nsf61: 'yes', nsf372: 'yes', method: '', calibratedOn: '2026-04-01', calDays: 365, license: 'file: rosemount-cert.pdf · sealed', proofOfSale: 'PO-2026-0501', manualLink: 'https://www.emerson.com/rosemount-2088', engSpecs: '0–150 psi, ±0.075% FS, 4–20 mA / HART', regCitations: 'AWWA M2; Ten States Standards', approvedForUse: 'yes', status: 'approved' },
        { name: 'Electromagnetic flow meter', sensorClass: 'mag_flow', category: 'meter', manufacturer: 'Endress+Hauser', model: 'Promag W 400', candidateSystem: 'all', source: 'official documentation', mfrAuth: 'file: eh-promagw-auth.pdf · sealed', compliance: 'NSF/ANSI/CAN 61 & 372 (liner/electrodes)', nsf61: 'yes', nsf372: 'yes', method: '', calibratedOn: '2025-08-01', calDays: 1825, license: 'file: eh-cert.pdf · sealed', proofOfSale: 'PO-2026-0488', manualLink: 'https://www.endress.com/promag-w-400', engSpecs: '±0.5% rate, full-pipe, Modbus/HART', regCitations: 'AWWA C701/C702', approvedForUse: 'yes', status: 'approved' },
        { name: 'AMI service meter (positive displacement)', sensorClass: 'pd_meter', category: 'meter', manufacturer: 'Sensus', model: 'iPERL', candidateSystem: 'all', source: 'official documentation', mfrAuth: 'file: sensus-iperl-auth.pdf · sealed', compliance: 'NSF/ANSI/CAN 61 & 372; AWWA C715', nsf61: 'yes', nsf372: 'yes', method: '', calibratedOn: '2026-01-10', calDays: 3650, license: 'file: sensus-cert.pdf · sealed', proofOfSale: 'PO-2026-0455', manualLink: 'https://sensus.com/iperl', engSpecs: '±1.5%, AMI/cellular', regCitations: 'AWWA C715', approvedForUse: 'yes', status: 'approved' },
        { name: 'Non-contact radar level', sensorClass: 'radar_level', category: 'sensor', manufacturer: 'VEGA', model: 'VEGAPULS 64', candidateSystem: 'all', source: 'official documentation', mfrAuth: 'file: vega-auth.pdf · sealed', compliance: 'Non-wetted (mounted above water surface)', nsf61: 'n/a', nsf372: 'n/a', method: '', calibratedOn: '2026-03-15', calDays: 730, license: 'file: vega-cert.pdf · sealed', proofOfSale: 'PO-2026-0460', manualLink: 'https://www.vega.com/vegapuls-64', engSpecs: '80 GHz radar, ±2 mm, 4–20 mA / Modbus', regCitations: 'AWWA M25', approvedForUse: 'yes', status: 'approved' },
        { name: 'Turbidity analyzer (online nephelometric)', sensorClass: 'turbidity', category: 'analyzer', manufacturer: 'Hach', model: 'TU5300 sc', candidateSystem: 'all', source: 'official documentation', mfrAuth: 'file: hach-tu5300-auth.pdf · sealed', compliance: 'NSF/ANSI/CAN 61 & 372; EPA 180.1', nsf61: 'yes', nsf372: 'yes', method: 'EPA 180.1; online per Hach 10258 (validated to State protocol)', calibratedOn: '2026-05-20', calDays: 90, license: 'file: hach-cert.pdf · sealed', proofOfSale: 'PO-2026-0489', manualLink: 'https://www.hach.com/tu5300sc', engSpecs: '0–700 NTU, ±2% rdg, 4–20 mA / Modbus', regCitations: '40 CFR 141.74 (online turbidity validation); EPA 180.1', approvedForUse: 'yes', status: 'approved' },
        { name: 'pH analyzer (online)', sensorClass: 'ph', category: 'analyzer', manufacturer: 'Hach', model: 'pHD sc', candidateSystem: 'all', source: 'official documentation', mfrAuth: 'file: hach-phd-auth.pdf · sealed', compliance: 'NSF/ANSI/CAN 61 & 372; SM 4500-H+ B', nsf61: 'yes', nsf372: 'yes', method: 'SM 4500-H+ B (electrometric) / EPA 150.1', calibratedOn: '2026-05-28', calDays: 30, license: 'file: hach-cert.pdf · sealed', proofOfSale: 'PO-2026-0490', manualLink: 'https://www.hach.com/phd-sc', engSpecs: '0–14 pH, ±0.02 pH, 4–20 mA / Modbus', regCitations: 'SM 4500-H+ B; 40 CFR 141.74', approvedForUse: 'yes', status: 'approved' },
        { name: 'Free chlorine analyzer (amperometric)', sensorClass: 'chlorine_residual', category: 'analyzer', manufacturer: 'Hach', model: 'CLF10sc', candidateSystem: 'all', source: 'official documentation', mfrAuth: 'file: hach-clf10sc-authorization.pdf · transferred & sealed', compliance: 'NSF/ANSI/CAN 61 & 372; SM 4500-Cl G (DPD)', nsf61: 'yes', nsf372: 'yes', method: 'SM 4500-Cl G (DPD) / Hach 10231 (online residual)', calibratedOn: '2026-05-22', calDays: 30, license: 'file: hach-certificate-2026.pdf · transferred & sealed', proofOfSale: 'PO-2026-0488 / INV-91233', manualLink: 'https://www.hach.com/clf10sc', engSpecs: '0–5 mg/L, ±0.05 mg/L, 4–20 mA / Modbus, 30-day calibration', regCitations: '40 CFR 141.72; 40 CFR 141.74', approvedForUse: 'yes', status: 'approved' },
        { name: 'Pipe/water temperature (PT100 RTD)', sensorClass: 'temperature_rtd', category: 'sensor', manufacturer: 'Endress+Hauser', model: 'iTHERM TM411', candidateSystem: 'all', source: 'official documentation', mfrAuth: 'file: eh-itherm-auth.pdf · sealed', compliance: 'NSF/ANSI/CAN 61 (wetted thermowell)', nsf61: 'yes', nsf372: 'yes', method: '', calibratedOn: '2026-02-01', calDays: 730, license: 'file: eh-cert.pdf · sealed', proofOfSale: 'PO-2026-0462', manualLink: 'https://www.endress.com/itherm-tm411', engSpecs: 'PT100 Class A, ±0.15 °C, 4–20 mA', regCitations: 'IEC 60751', approvedForUse: 'yes', status: 'approved' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'engineer', 'compliance_officer'] }
    },

    // ── REPORT SCHEDULES ──
    {
      id: 'report_schedules', name: 'Report Schedules', icon: '🗓️', group: 'Operations',
      desc: 'Scheduled reports — type, format, what is included, and cadence (one-time or recurring). Defined here or from the Reports builder; run-now in this demo.',
      schema: [
        { key: 'name', label: 'Name', required: true },
        { key: 'type', label: 'Report', type: 'select', options: sel('compliance', 'incidents', 'assets', 'billing', 'sensor-stats', 'risk', 'forecast', 'legal-discovery') },
        { key: 'format', label: 'Format', type: 'select', options: sel('CSV', 'on-screen', 'PDF (licensed)') },
        { key: 'cadence', label: 'Cadence', type: 'select', options: sel('one-time', 'daily', 'weekly', 'monthly', 'quarterly', 'annual') },
        { key: 'recipients', label: 'Recipients' },
        { key: 'nextRun', label: 'Next run', type: 'date' },
        { key: 'status', label: 'Status', type: 'select', options: sel('active', 'paused') }
      ],
      seed: [
        { name: 'Monthly compliance to State DDW', type: 'compliance', format: 'CSV', cadence: 'monthly', recipients: 'ddw@state.gov; ops@utility', nextRun: '2026-07-01', status: 'active' },
        { name: 'Weekly risk assessment', type: 'risk', format: 'on-screen', cadence: 'weekly', recipients: 'manager@utility', nextRun: '2026-06-15', status: 'active' },
        { name: 'Quarterly legal-discovery archive', type: 'legal-discovery', format: 'CSV', cadence: 'quarterly', recipients: 'counsel@utility', nextRun: '2026-09-01', status: 'active' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'compliance_officer'] }
    },

    // ── PROCUREMENT ──
    {
      id: 'vendors', name: 'Vendors & Manufacturing', icon: '🏭', group: 'Procurement',
      desc: 'Approved suppliers, lead times, ratings, contracts — with alternates for supply-line resilience.',
      schema: [
        { key: 'name', label: 'Vendor' }, { key: 'category', label: 'Category' }, { key: 'contact', label: 'Contact' },
        { key: 'leadDays', label: 'Lead (days)', type: 'number' }, { key: 'rating', label: 'Rating (1-5)', type: 'number' },
        { key: 'preferred', label: 'Tier', type: 'select', options: sel('primary', 'alternate', 'emergency') },
        { key: 'contractEnd', label: 'Contract end', type: 'date' }
      ],
      seed: [
        { name: 'Endress+Hauser', category: 'Instrumentation', contact: 'sales@eh.com', leadDays: 21, rating: 5, preferred: 'primary', contractEnd: '2027-12-31' },
        { name: 'Univar Solutions', category: 'Treatment chemicals', contact: 'orders@univar.com', leadDays: 5, rating: 4, preferred: 'primary', contractEnd: '2026-12-31' },
        { name: 'Brenntag', category: 'Treatment chemicals', contact: 'na@brenntag.com', leadDays: 7, rating: 4, preferred: 'alternate', contractEnd: '2026-12-31' },
        { name: 'Rangeline Tapping', category: 'Emergency repair', contact: '24h dispatch', leadDays: 0, rating: 5, preferred: 'emergency', contractEnd: '2026-12-31' },
        { name: 'US Pipe', category: 'Ductile iron pipe/fittings', contact: 'distribution@uspipe.com', leadDays: 30, rating: 4, preferred: 'primary', contractEnd: '2028-06-30' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'finance', 'engineer'] }
    },
    {
      id: 'procurement', name: 'Procurement & Orders', icon: '🧾', group: 'Procurement',
      desc: 'Purchase orders with approval workflow, costs, need-by dates (real-time + future inventory).',
      schema: [
        { key: 'po', label: 'PO #' }, { key: 'item', label: 'Item' }, { key: 'qty', label: 'Qty', type: 'number' },
        { key: 'unitCost', label: 'Unit $', type: 'number' }, { key: 'vendor', label: 'Vendor' },
        { key: 'status', label: 'Status', type: 'select', options: sel('requested', 'approved', 'ordered', 'received', 'cancelled') },
        { key: 'needBy', label: 'Need by', type: 'date' }
      ],
      seed: [
        { po: 'PO-24117', item: 'Sodium hypochlorite 12.5% (bulk gal)', qty: 4500, unitCost: 1.85, vendor: 'Univar Solutions', status: 'ordered', needBy: '2026-06-15' },
        { po: 'PO-24121', item: 'Free chlorine analyzer reagent kit', qty: 12, unitCost: 145, vendor: 'Endress+Hauser', status: 'approved', needBy: '2026-06-20' },
        { po: 'PO-24130', item: '24" DI pipe sticks (repair stock)', qty: 20, unitCost: 1280, vendor: 'US Pipe', status: 'requested', needBy: '2026-07-30' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'finance', 'engineer'] }
    },

    // ── RISK / SECURITY ──
    {
      id: 'incidents', name: 'Incidents & Threats', icon: '🚨', group: 'Risk',
      desc: 'Leaks/breaks, contamination, cyber, sabotage/terrorism, natural events — with mitigation & recovery.',
      schema: [
        { key: 'type', label: 'Type', type: 'select', options: sel('leak', 'main-break', 'contamination', 'cyber', 'sabotage', 'terrorism', 'natural', 'equipment', 'drought') },
        { key: 'severity', label: 'Severity', type: 'select', options: sel('low', 'medium', 'high', 'critical') },
        { key: 'location', label: 'Location' },
        { key: 'status', label: 'Status', type: 'select', options: sel('open', 'mitigating', 'recovering', 'resolved') },
        { key: 'mitigation', label: 'Mitigation' }, { key: 'recovery', label: 'Recovery plan' },
        { key: 'reported', label: 'Reported', type: 'date' }
      ],
      seed: [
        { type: 'main-break', severity: 'high', location: 'SEG-DMA-7 (12" main)', status: 'mitigating', mitigation: 'Isolate 4 valves; reroute via DMA-8 cross-tie', recovery: 'Crew dispatched; reserves feeding zone', reported: '2026-06-07' },
        { type: 'cyber', severity: 'medium', location: 'SCADA HMI gateway', status: 'recovering', mitigation: 'Blocked external IP; rotated creds; air-gap verified', recovery: 'Forensics + patch; report to CISA', reported: '2026-06-05' },
        { type: 'drought', severity: 'medium', location: 'System-wide', status: 'open', mitigation: 'Stage 1 conservation declared', recovery: 'Activate alternate wholesale supply', reported: '2026-06-01' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'operator', 'engineer', 'security_officer'] }
    },
    {
      id: 'security', name: 'Security & Classification', icon: '🔐', group: 'Risk',
      desc: 'Asset classification, access controls, clearances. Zero-trust, least-privilege by policy.',
      schema: [
        { key: 'asset', label: 'Asset / dataset' },
        { key: 'classification', label: 'Classification', type: 'select', options: sel('public', 'internal', 'confidential', 'restricted', 'classified') },
        { key: 'control', label: 'Control' }, { key: 'clearance', label: 'Min clearance' },
        { key: 'zeroTrust', label: 'Zero-trust', type: 'select', options: sel('yes', 'no') }, { key: 'notes', label: 'Notes' }
      ],
      seed: [
        { asset: 'SCADA control network', classification: 'restricted', control: 'Air-gapped + MFA + allowlist', clearance: 'Operator+', zeroTrust: 'yes', notes: 'No remote write; read-only telemetry replica externally' },
        { asset: 'Well-field & intake schematics', classification: 'confidential', control: 'Need-to-know; watermarked', clearance: 'Engineer+', zeroTrust: 'yes', notes: 'Exempt from FOIA (critical infrastructure)' },
        { asset: 'Vulnerability assessment (AWIA)', classification: 'classified', control: 'Sealed; counsel only', clearance: 'Security Officer', zeroTrust: 'yes', notes: 'Statutorily protected' },
        { asset: 'Public water-quality report (CCR)', classification: 'public', control: 'Published annually', clearance: 'Public', zeroTrust: 'no', notes: 'Required disclosure' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'security_officer'] }
    },

    // ── FINANCE ──
    {
      id: 'accounts', name: 'Billing & Accounts', icon: '💳', group: 'Finance',
      desc: 'Customer accounts, metering, balances, collections, shutoff workflow for non-payment.',
      schema: [
        { key: 'account', label: 'Account #' }, { key: 'customer', label: 'Customer' },
        { key: 'class', label: 'Class', type: 'select', options: sel('residential', 'commercial', 'industrial', 'municipal', 'agricultural') },
        { key: 'meterId', label: 'Meter ID' }, { key: 'usageKgal', label: 'Usage (kgal)', type: 'number' },
        { key: 'balance', label: 'Balance $', type: 'number' },
        { key: 'status', label: 'Status', type: 'select', options: sel('current', 'past_due', 'shutoff_pending', 'shutoff', 'exempt') },
        { key: 'lastPayment', label: 'Last payment', type: 'date' }
      ],
      seed: [
        { account: 'A-100231', customer: 'Maple St residence', class: 'residential', meterId: 'M-58821', usageKgal: 6.2, balance: 0, status: 'current', lastPayment: '2026-05-28' },
        { account: 'A-200884', customer: 'Northgate Mall', class: 'commercial', meterId: 'M-31002', usageKgal: 412, balance: 1840.50, status: 'past_due', lastPayment: '2026-04-15' },
        { account: 'A-300112', customer: 'Cascade Foods (plant)', class: 'industrial', meterId: 'M-77410', usageKgal: 5180, balance: 12950.00, status: 'shutoff_pending', lastPayment: '2026-03-30' },
        { account: 'A-400050', customer: 'County Fire District', class: 'municipal', meterId: 'M-00910', usageKgal: 0, balance: 0, status: 'exempt', lastPayment: '—' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'finance'] }
    },
    {
      id: 'taxes', name: 'Taxes & Fees', icon: '🏛️', group: 'Finance',
      desc: 'Multi-level taxes and regulatory fees (federal, state, county, city, stormwater).',
      schema: [
        { key: 'jurisdiction', label: 'Jurisdiction', type: 'select', options: sel('Federal', 'State', 'County', 'City') },
        { key: 'type', label: 'Type' }, { key: 'rate', label: 'Rate' }, { key: 'basis', label: 'Basis' },
        { key: 'period', label: 'Period' }, { key: 'amount', label: 'Amount $', type: 'number' },
        { key: 'status', label: 'Status', type: 'select', options: sel('filed', 'due', 'paid', 'overdue') }
      ],
      seed: [
        { jurisdiction: 'State', type: 'Drinking-water program fee', rate: '$/connection', basis: '62,000 connections', period: '2026 Q2', amount: 93000, status: 'due' },
        { jurisdiction: 'City', type: 'Stormwater utility fee', rate: '$6.20/ERU', basis: 'impervious area', period: '2026 Q2', amount: 384400, status: 'filed' },
        { jurisdiction: 'Federal', type: 'Form 990 (public authority)', rate: '—', basis: 'annual', period: '2025', amount: 0, status: 'filed' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'finance'] }
    },

    // ── OPERATIONS ──
    {
      id: 'conservation', name: 'Conservation & Rationing', icon: '💧', group: 'Operations',
      desc: 'Drought stages, usage limits, mandatory rationing, restrictions and penalties.',
      schema: [
        { key: 'measure', label: 'Measure' }, { key: 'trigger', label: 'Trigger' }, { key: 'restriction', label: 'Restriction' },
        { key: 'appliesTo', label: 'Applies to' }, { key: 'penalty', label: 'Penalty' },
        { key: 'status', label: 'Status', type: 'select', options: sel('active', 'standby', 'lifted') }
      ],
      seed: [
        { measure: 'Stage 1 — Voluntary', trigger: 'Reservoir < 70%', restriction: 'Request 10% reduction; no daytime irrigation', appliesTo: 'All', penalty: 'None', status: 'active' },
        { measure: 'Stage 2 — Mandatory', trigger: 'Reservoir < 50%', restriction: 'Odd/even watering; no car washing', appliesTo: 'Residential/Commercial', penalty: 'Surcharge', status: 'standby' },
        { measure: 'Stage 4 — Emergency', trigger: 'Reservoir < 20%', restriction: 'Health/safety use only; rationing', appliesTo: 'All', penalty: 'Fines + flow restrictor', status: 'standby' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'operator', 'compliance_officer'] }
    },
    {
      id: 'emergency', name: 'Emergency & Diversion Protocols', icon: '🛟', group: 'Operations',
      desc: 'Disaster recovery, failsafe diversion for firefighting / military / agriculture, mutual aid.',
      schema: [
        { key: 'protocol', label: 'Protocol' },
        { key: 'scenario', label: 'Scenario', type: 'select', options: sel('fire', 'military', 'drought', 'contamination', 'outage', 'natural', 'sabotage') },
        { key: 'action', label: 'Action' }, { key: 'divertTo', label: 'Divert to' }, { key: 'authority', label: 'Authorizing role' },
        { key: 'status', label: 'Status', type: 'select', options: sel('armed', 'active', 'standby') }
      ],
      seed: [
        { protocol: 'Fire-flow priority', scenario: 'fire', action: 'Open zone valves, max booster, hold ≥20 psi to hydrants', divertTo: 'Affected fire zone', authority: 'Operator + Fire IC', status: 'armed' },
        { protocol: 'Military/defense priority order', scenario: 'military', action: 'Reserve capacity to designated installation per MOU', divertTo: 'Installation main', authority: 'Executive + DoD liaison', status: 'standby' },
        { protocol: 'Drought ag-diversion', scenario: 'drought', action: 'Shift surplus to agricultural canal under allocation', divertTo: 'Irrigation district', authority: 'Compliance Officer', status: 'standby' },
        { protocol: 'Contamination isolation + boil-water', scenario: 'contamination', action: 'Isolate zone, advisory, alt-supply, sample', divertTo: 'N/A (isolate)', authority: 'Compliance Officer', status: 'armed' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'operator', 'compliance_officer', 'security_officer'] }
    },

    // ── DATA GOVERNANCE / ENV / INSURANCE / PERSONNEL ──
    {
      id: 'datagov', name: 'Data Governance', icon: '🗄️', group: 'Governance',
      desc: 'Retention, RAID/offsite archiving, encryption, legal hold, FOIA & eDiscovery status.',
      schema: [
        { key: 'dataset', label: 'Dataset' }, { key: 'retentionYears', label: 'Retention (yr)', type: 'number' },
        { key: 'storage', label: 'Storage' }, { key: 'encryption', label: 'Encryption' },
        { key: 'foia', label: 'FOIA', type: 'select', options: sel('releasable', 'redacted', 'exempt') },
        { key: 'legalHold', label: 'Legal hold', type: 'select', options: sel('no', 'yes') },
        { key: 'lastArchive', label: 'Last archive', type: 'date' }
      ],
      seed: [
        { dataset: 'SCADA telemetry (manifold)', retentionYears: 10, storage: 'RAID-6 + nightly offsite', encryption: 'AES-256 at rest', foia: 'redacted', legalHold: 'no', lastArchive: '2026-06-07' },
        { dataset: 'Audit / event log (hash-chained)', retentionYears: 7, storage: 'WORM + RAID-6', encryption: 'AES-256', foia: 'releasable', legalHold: 'yes', lastArchive: '2026-06-07' },
        { dataset: 'Water-quality records', retentionYears: 10, storage: 'RAID-6 + cloud', encryption: 'AES-256', foia: 'releasable', legalHold: 'no', lastArchive: '2026-06-06' },
        { dataset: 'Customer PII / billing', retentionYears: 7, storage: 'Encrypted DB + offsite', encryption: 'AES-256 + field-level', foia: 'exempt', legalHold: 'no', lastArchive: '2026-06-07' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'compliance_officer'] }
    },
    {
      id: 'environmental', name: 'Environmental & Sources', icon: '🌿', group: 'Compliance',
      desc: 'Source/reclaimed/sewer water programs, permits, toxin & pollution monitoring (incl. PFAS).',
      schema: [
        { key: 'program', label: 'Program' }, { key: 'parameter', label: 'Parameter' }, { key: 'requirement', label: 'Requirement' },
        { key: 'source', label: 'Source', type: 'select', options: sel('potable', 'irrigation', 'reclaimed', 'sewer', 'raw') },
        { key: 'permit', label: 'Permit #' }, { key: 'status', label: 'Status', type: 'select', options: sel('compliant', 'monitoring', 'exceedance') }
      ],
      seed: [
        { program: 'PFAS monitoring (UCMR5)', parameter: 'PFOA/PFOS', requirement: '≤ 4.0 ppt (2024 MCL)', source: 'potable', permit: 'UCMR5', status: 'monitoring' },
        { program: 'NPDES discharge', parameter: 'TSS / chlorine', requirement: 'Permit limits', source: 'sewer', permit: 'NPDES-UT0021', status: 'compliant' },
        { program: 'Reclaimed water reuse', parameter: 'Turbidity / coliform', requirement: 'Title 22 Class A', source: 'reclaimed', permit: 'REUSE-114', status: 'compliant' },
        { program: 'Source-water protection', parameter: 'Wellhead zone', requirement: 'DWSP plan', source: 'raw', permit: 'DWSP-09', status: 'compliant' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'compliance_officer', 'engineer'] }
    },
    {
      id: 'insurance', name: 'Insurance & Liability', icon: '☂️', group: 'Risk',
      desc: 'Property, liability, cyber, business-interruption and flood (act-of-God) coverage.',
      schema: [
        { key: 'policy', label: 'Policy' }, { key: 'carrier', label: 'Carrier' }, { key: 'limit', label: 'Limit $', type: 'number' },
        { key: 'deductible', label: 'Deductible $', type: 'number' }, { key: 'perils', label: 'Perils' }, { key: 'renewal', label: 'Renewal', type: 'date' },
        { key: 'status', label: 'Status', type: 'select', options: sel('active', 'lapsed', 'renewing') }
      ],
      seed: [
        { policy: 'PROP-2026', carrier: 'Travelers', limit: 250000000, deductible: 100000, perils: 'Fire, equipment, named storm', renewal: '2027-01-01', status: 'active' },
        { policy: 'CYBER-2026', carrier: 'Beazley', limit: 10000000, deductible: 250000, perils: 'Breach, ransomware, SCADA', renewal: '2026-11-01', status: 'active' },
        { policy: 'FLOOD-2026', carrier: 'NFIP', limit: 50000000, deductible: 500000, perils: 'Flood / act of God', renewal: '2026-09-15', status: 'active' },
        { policy: 'BI-2026', carrier: 'Chubb', limit: 75000000, deductible: 250000, perils: 'Business interruption', renewal: '2027-01-01', status: 'active' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'finance'] }
    },
    {
      id: 'personnel', name: 'Personnel, Access & Alerts', icon: '👤', group: 'Governance',
      desc: 'Everyone who may operate or access the platform, and everyone who must be alerted. Each person carries a NON-PII user-id used for all access/activity logging; contact details (PII) drive email/SMS alerting and are access-controlled. Login access is granted per least-privilege role.',
      schema: [
        { key: 'userId', label: 'User-id (non-PII)' },
        { key: 'name', label: 'Name' }, { key: 'role', label: 'Platform role' }, { key: 'dept', label: 'Department' },
        { key: 'certs', label: 'Certifications' }, { key: 'clearance', label: 'Clearance' },
        { key: 'access', label: 'Login access', type: 'select', options: sel('enabled', 'suspended', 'none') },
        { key: 'email', label: 'Email (alerts)', type: 'url' },
        { key: 'mobile', label: 'Mobile (SMS alerts)' },
        { key: 'alertChannel', label: 'Alert channel', type: 'select', options: sel('none', 'email', 'SMS', 'email+SMS') },
        { key: 'alertMin', label: 'Alert at severity ≥', type: 'select', options: sel('warning', 'alarm', 'critical', 'none') },
        { key: 'onCall', label: 'On-call', type: 'select', options: sel('yes', 'no') },
        { key: 'status', label: 'Status', type: 'select', options: sel('active', 'on-leave', 'inactive') }
      ],
      seed: [
        { userId: 'U-7F3A', name: 'J. Rivera', role: 'operator', dept: 'Operations', certs: 'Grade IV Distribution', clearance: 'Operator', access: 'enabled', email: 'mailto:operator@utility.example', mobile: '+1-555-0142', alertChannel: 'email+SMS', alertMin: 'warning', onCall: 'yes', status: 'active' },
        { userId: 'U-2C9D', name: 'S. Okafor', role: 'compliance_officer', dept: 'Compliance', certs: 'Grade IV Treatment', clearance: 'Confidential', access: 'enabled', email: 'mailto:compliance@utility.example', mobile: '+1-555-0173', alertChannel: 'email', alertMin: 'alarm', onCall: 'no', status: 'active' },
        { userId: 'U-5B11', name: 'D. Park', role: 'engineer', dept: 'Engineering', certs: 'PE Civil', clearance: 'Confidential', access: 'enabled', email: 'mailto:engineer@utility.example', mobile: '+1-555-0190', alertChannel: 'email', alertMin: 'alarm', onCall: 'no', status: 'active' },
        { userId: 'U-9E07', name: 'M. Vance', role: 'security_officer', dept: 'Security', certs: 'CISSP', clearance: 'Classified', access: 'enabled', email: 'mailto:security@utility.example', mobile: '+1-555-0118', alertChannel: 'email+SMS', alertMin: 'critical', onCall: 'yes', status: 'active' },
        { userId: 'U-1A44', name: 'A. Admin', role: 'administrator', dept: 'IT', certs: '—', clearance: 'Restricted', access: 'enabled', email: 'mailto:admin@utility.example', mobile: '+1-555-0100', alertChannel: 'email', alertMin: 'critical', onCall: 'no', status: 'active' }
      ],
      rbac: { view: ['*'], edit: ['administrator'] }
    },

    // ── LEGAL ──
    {
      id: 'contracts', name: 'Contracts', icon: '📄', group: 'Legal',
      desc: 'Supply, service, mutual-aid, interconnect & license agreements; terms, value, renewal.',
      schema: [
        { key: 'party', label: 'Counterparty' },
        { key: 'type', label: 'Type', type: 'select', options: sel('supply', 'service', 'mutual-aid', 'interconnect', 'construction', 'SaaS/license') },
        { key: 'value', label: 'Value $', type: 'number' }, { key: 'start', label: 'Start', type: 'date' }, { key: 'end', label: 'End', type: 'date' },
        { key: 'autorenew', label: 'Auto-renew', type: 'select', options: sel('yes', 'no') }, { key: 'counsel', label: 'Counsel' },
        { key: 'status', label: 'Status', type: 'select', options: sel('active', 'expiring', 'expired', 'draft', 'disputed') }
      ],
      seed: [
        { party: 'Regional Wholesale A', type: 'supply', value: 2400000, start: '2024-01-01', end: '2027-12-31', autorenew: 'yes', counsel: 'Smith & Cole LLP', status: 'active' },
        { party: 'Rangeline Tapping', type: 'service', value: 180000, start: '2026-01-01', end: '2026-12-31', autorenew: 'yes', counsel: 'In-house', status: 'active' },
        { party: 'Cascade Foods', type: 'interconnect', value: 0, start: '2022-06-01', end: '2026-06-30', autorenew: 'no', counsel: 'Smith & Cole LLP', status: 'disputed' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'finance', 'compliance_officer'] }
    },
    {
      id: 'litigation', name: 'Disputes & Litigation', icon: '⚔️', group: 'Legal',
      desc: 'Claims, disputes, litigation with exposure, law firm, and strategy.',
      schema: [
        { key: 'matter', label: 'Matter' }, { key: 'type', label: 'Type', type: 'select', options: sel('dispute', 'litigation', 'claim', 'regulatory-action', 'arbitration') },
        { key: 'opposing', label: 'Opposing party' }, { key: 'firm', label: 'Law firm' }, { key: 'exposure', label: 'Exposure $', type: 'number' },
        { key: 'strategy', label: 'Strategy' }, { key: 'status', label: 'Status', type: 'select', options: sel('open', 'negotiating', 'settled', 'trial', 'closed') }
      ],
      seed: [
        { matter: 'Cascade Foods billing dispute', type: 'dispute', opposing: 'Cascade Foods Inc.', firm: 'Smith & Cole LLP', exposure: 42000, strategy: 'Negotiate payment plan; meter-audit evidence', status: 'negotiating' },
        { matter: 'Main-break property claim (Maple St)', type: 'claim', opposing: 'Homeowner', firm: 'In-house', exposure: 18000, strategy: 'Insurance tender; document response time', status: 'open' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'compliance_officer'] }
    },
    {
      id: 'ip', name: 'IP, Patents & Trade Secrets', icon: '🧬', group: 'Legal',
      desc: 'Patents, trademarks, copyrights, trade secrets + corporate-espionage controls.',
      schema: [
        { key: 'asset', label: 'Asset' }, { key: 'type', label: 'Type', type: 'select', options: sel('patent', 'trademark', 'copyright', 'trade-secret') },
        { key: 'number', label: 'Reg/App #' }, { key: 'jurisdiction', label: 'Jurisdiction' }, { key: 'protection', label: 'Protection / espionage control' },
        { key: 'classification', label: 'Classification', type: 'select', options: sel('internal', 'confidential', 'restricted', 'classified') },
        { key: 'status', label: 'Status', type: 'select', options: sel('granted', 'pending', 'registered', 'protected', 'lapsed') }
      ],
      seed: [
        { asset: 'Manifold telemetry health method (z=x·y)', type: 'patent', number: 'US-APP-18/xxx,xxx', jurisdiction: 'USPTO', protection: 'Provisional filed; NDA-gated source', classification: 'confidential', status: 'pending' },
        { asset: 'HydroManifold (wordmark)', type: 'trademark', number: 'TM-90xxxxxx', jurisdiction: 'USPTO', protection: 'Registered', classification: 'internal', status: 'registered' },
        { asset: 'Failsafe drift algorithm', type: 'trade-secret', number: 'TS-014', jurisdiction: '—', protection: 'Need-to-know; access-logged; key-employee NDA; no offshore', classification: 'restricted', status: 'protected' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'compliance_officer', 'security_officer'] }
    },

    // ── GOVERNANCE / IT ──
    {
      id: 'policies', name: 'Corporate & Ethics Policies', icon: '📐', group: 'Governance',
      desc: 'Corporate, ethics, HR, security and operational policies with version control.',
      schema: [
        { key: 'policy', label: 'Policy' }, { key: 'category', label: 'Category', type: 'select', options: sel('corporate', 'ethics', 'security', 'HR', 'compliance', 'operational') },
        { key: 'owner', label: 'Owner' }, { key: 'version', label: 'Version' }, { key: 'review', label: 'Next review', type: 'date' },
        { key: 'status', label: 'Status', type: 'select', options: sel('active', 'draft', 'under-review', 'retired') }
      ],
      seed: [
        { policy: 'Code of Ethics & Conduct', category: 'ethics', owner: 'Executive', version: '3.1', review: '2027-01-01', status: 'active' },
        { policy: 'Cybersecurity & Zero-Trust Policy', category: 'security', owner: 'Security Officer', version: '2.4', review: '2026-09-01', status: 'active' },
        { policy: 'Records Retention & FOIA Policy', category: 'compliance', owner: 'Compliance Officer', version: '1.6', review: '2026-12-01', status: 'active' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'compliance_officer'] }
    },
    {
      id: 'documents', name: 'Schematics, Diagrams & Workflows', icon: '🗺️', group: 'Governance',
      desc: 'Network schematics, P&IDs, workflows and SOPs — classified per security policy.',
      schema: [
        { key: 'title', label: 'Document' }, { key: 'type', label: 'Type', type: 'select', options: sel('network-schematic', 'P&ID', 'workflow', 'SOP', 'site-plan', 'as-built') },
        { key: 'classification', label: 'Classification', type: 'select', options: sel('public', 'internal', 'confidential', 'restricted', 'classified') },
        { key: 'owner', label: 'Owner' }, { key: 'version', label: 'Version' }, { key: 'updated', label: 'Updated', type: 'date' }
      ],
      seed: [
        { title: 'Distribution network schematic', type: 'network-schematic', classification: 'confidential', owner: 'Engineering', version: '12.3', updated: '2026-05-01' },
        { title: 'WTP process P&ID', type: 'P&ID', classification: 'restricted', owner: 'Engineering', version: '8.1', updated: '2026-03-15' },
        { title: 'Main-break response workflow', type: 'workflow', classification: 'internal', owner: 'Operations', version: '4.0', updated: '2026-06-01' },
        { title: 'Vulnerability / risk assessment map', type: 'site-plan', classification: 'classified', owner: 'Security', version: '2.0', updated: '2026-02-01' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'engineer', 'security_officer'] }
    },

    // ── FINANCE ──
    {
      id: 'financials', name: 'Financials & Budget', icon: '📊', group: 'Finance',
      desc: 'Income sources, expenses, budgets and variance — the accounting rollup.',
      schema: [
        { key: 'line', label: 'Line item' }, { key: 'category', label: 'Category', type: 'select', options: sel('income', 'expense') },
        { key: 'counterparty', label: 'Source / payee' }, { key: 'amount', label: 'Actual $', type: 'number' }, { key: 'budget', label: 'Budget $', type: 'number' }, { key: 'period', label: 'Period' }
      ],
      seed: [
        { line: 'Water sales revenue', category: 'income', counterparty: 'Ratepayers', amount: 3120000, budget: 3000000, period: '2026 Q2' },
        { line: 'Connection & impact fees', category: 'income', counterparty: 'Developers', amount: 410000, budget: 380000, period: '2026 Q2' },
        { line: 'Energy (pumping)', category: 'expense', counterparty: 'Power utility', amount: 284000, budget: 260000, period: '2026 Q2' },
        { line: 'Treatment chemicals', category: 'expense', counterparty: 'Univar/Brenntag', amount: 96000, budget: 90000, period: '2026 Q2' },
        { line: 'Debt service (bonds)', category: 'expense', counterparty: 'Bond trustee', amount: 520000, budget: 520000, period: '2026 Q2' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'finance'] }
    },

    // ── ASSETS / PROCUREMENT ──
    {
      id: 'maintenance', name: 'Maintenance & Replacement', icon: '🛠️', group: 'Assets',
      desc: 'Preventive/corrective work orders and asset replacement scheduling.',
      schema: [
        { key: 'wo', label: 'Work order' }, { key: 'asset', label: 'Asset' }, { key: 'type', label: 'Type', type: 'select', options: sel('preventive', 'corrective', 'replacement', 'inspection') },
        { key: 'due', label: 'Due', type: 'date' }, { key: 'cost', label: 'Est cost $', type: 'number' }, { key: 'contractor', label: 'Assigned' },
        { key: 'status', label: 'Status', type: 'select', options: sel('scheduled', 'in-progress', 'complete', 'overdue') }
      ],
      seed: [
        { wo: 'WO-5521', asset: 'CL2-WTP analyzer', type: 'preventive', due: '2026-06-20', cost: 600, contractor: 'In-house', status: 'scheduled' },
        { wo: 'WO-5530', asset: 'PMP-BS1-B bearing', type: 'corrective', due: '2026-06-12', cost: 8500, contractor: 'Flowserve service', status: 'in-progress' },
        { wo: 'WO-5544', asset: 'TANK-NE recoat', type: 'replacement', due: '2026-10-01', cost: 420000, contractor: 'TBD (bid)', status: 'scheduled' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'engineer', 'operator'] }
    },
    {
      id: 'contractors', name: 'Contractors & Services', icon: '👷', group: 'Procurement',
      desc: 'Service contractors, rates, contracts and performance (labor supply sources).',
      schema: [
        { key: 'name', label: 'Contractor' }, { key: 'trade', label: 'Trade' }, { key: 'rate', label: 'Rate' }, { key: 'rating', label: 'Rating (1-5)', type: 'number' },
        { key: 'contractEnd', label: 'Contract end', type: 'date' }, { key: 'status', label: 'Status', type: 'select', options: sel('active', 'preferred', 'suspended', 'expired') }
      ],
      seed: [
        { name: 'Flowserve Service', trade: 'Pump/mechanical', rate: '$185/h', rating: 5, contractEnd: '2027-06-30', status: 'preferred' },
        { name: 'Aqua-Trace', trade: 'Leak detection', rate: '$2,500/survey', rating: 4, contractEnd: '2026-12-31', status: 'active' },
        { name: 'Beehive Electric', trade: 'Electrical/SCADA', rate: '$160/h', rating: 4, contractEnd: '2026-12-31', status: 'active' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'finance', 'engineer'] }
    },
    {
      id: 'software', name: 'Software & Licenses (SBOM)', icon: '💽', group: 'IT',
      desc: 'Software components, libraries, licenses and sources — augmenting or standalone.',
      schema: [
        { key: 'component', label: 'Component' }, { key: 'role', label: 'Role', type: 'select', options: sel('augments', 'independent', 'library', 'OS/runtime') },
        { key: 'version', label: 'Version' }, { key: 'license', label: 'License' }, { key: 'source', label: 'Source' }, { key: 'eol', label: 'EOL/Support', type: 'date' },
        { key: 'status', label: 'Status', type: 'select', options: sel('supported', 'patch-due', 'EOL-risk', 'deprecated') }
      ],
      seed: [
        { component: 'HydroManifold engine', role: 'independent', version: '2.0', license: 'Proprietary', source: 'internal', eol: '—', status: 'supported' },
        { component: 'Manifold telemetry (z=x·y)', role: 'augments', version: '7', license: 'Proprietary', source: 'internal', eol: '—', status: 'supported' },
        { component: 'Node.js runtime', role: 'OS/runtime', version: '20 LTS', license: 'MIT', source: 'nodejs.org', eol: '2026-04-30', status: 'patch-due' },
        { component: 'nginx', role: 'independent', version: '1.24', license: 'BSD-2', source: 'nginx.org', eol: '2027', status: 'supported' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'engineer'] }
    },
    {
      id: 'techdebt', name: 'Technical Debt & Modernization', icon: '🧱', group: 'IT',
      desc: 'Debt items with risk-if-unpaid (interest), effort and paydown plan; modernization roadmap.',
      schema: [
        { key: 'item', label: 'Item' }, { key: 'area', label: 'Area' }, { key: 'severity', label: 'Severity', type: 'select', options: sel('low', 'medium', 'high', 'critical') },
        { key: 'interest', label: 'Risk if unpaid' }, { key: 'effort', label: 'Effort' }, { key: 'plan', label: 'Paydown plan' },
        { key: 'status', label: 'Status', type: 'select', options: sel('backlog', 'planned', 'in-progress', 'paid-off') }
      ],
      seed: [
        { item: 'Legacy SCADA polling driver', area: 'Telemetry', severity: 'high', interest: 'Outages on protocol edge cases', effort: '6 wks', plan: 'Replace with manifold ingestor', status: 'planned' },
        { item: 'Monolithic move-calc function', area: 'Engine', severity: 'medium', interest: 'Slows changes; bug risk', effort: '2 wks', plan: 'Extract + unit tests', status: 'in-progress' },
        { item: 'Manual cert renewal', area: 'DevOps', severity: 'low', interest: 'Expiry risk', effort: '2 days', plan: 'certbot auto-renew + alerts', status: 'paid-off' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'engineer'] }
    },
    {
      id: 'hardware', name: 'Hardware & Sensor Requirements', icon: '🧰', group: 'IT',
      desc: 'Compute, network and sensor hardware requirements with vendor and lead time.',
      schema: [
        { key: 'component', label: 'Component' }, { key: 'spec', label: 'Spec' }, { key: 'qty', label: 'Qty', type: 'number' }, { key: 'vendor', label: 'Vendor' },
        { key: 'leadDays', label: 'Lead (days)', type: 'number' }, { key: 'status', label: 'Status', type: 'select', options: sel('in-stock', 'order', 'installed', 'spec-only') }
      ],
      seed: [
        { component: 'SCADA server (redundant pair)', spec: '2× Xeon, ECC, RAID-6, dual PSU', qty: 2, vendor: 'Dell', leadDays: 30, status: 'installed' },
        { component: 'RTU / PLC', spec: 'Modbus/DNP3, -40..70°C', qty: 24, vendor: 'Schneider', leadDays: 45, status: 'order' },
        { component: 'Wall-monitor displays', spec: '55" 4K, 24/7 rated', qty: 6, vendor: 'Samsung', leadDays: 14, status: 'installed' },
        { component: 'Pressure transducer (spare)', spec: '0-150 psi, 4-20 mA', qty: 30, vendor: 'Endress+Hauser', leadDays: 21, status: 'in-stock' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'engineer'] }
    },
    // ── COMMISSIONING CHECKLIST (mandatory prerequisites for go-live) ──
    // These are standard and known beforehand, so they are pre-loaded by default.
    // Real-time operation is LOCKED until every required item is on file AND the
    // operating authorization verifies. Statuses are editable only with change
    // authority. Citations are the federal floor; STATE rules may be stricter and
    // are what actually bind a given system.
    {
      id: 'commissioning', name: 'Commissioning Checklist (Go-Live)', icon: '⚙️', group: 'Operations',
      desc: 'Mandatory regulatory prerequisites for operating a real public water system in real time. The federal floor is cited; a state primacy agency may require more. Go-live stays LOCKED until every required item is complete/on-file and a signed operating authorization is installed.',
      schema: [
        { key: 'item', label: 'Prerequisite', required: true },
        { key: 'citation', label: 'Authority / citation' },
        { key: 'appliesTo', label: 'Applies to', type: 'select', options: sel('all PWS', 'CWS', 'CWS/NTNC', 'CWS > 3,300', 'surface water / GWUDI') },
        { key: 'required', label: 'Required for go-live', type: 'select', options: sel('yes', 'no') },
        { key: 'status', label: 'Status', type: 'select', options: sel('complete', 'on-file', 'in-progress', 'pending', 'n/a') },
        { key: 'evidence', label: 'Evidence / reference' },
        { key: 'owner', label: 'Owner role' }
      ],
      seed: [
        { item: 'Sample siting plan (routine + repeat coliform locations)', citation: '40 CFR Part 141 Subpart Y (Revised Total Coliform Rule)', appliesTo: 'all PWS', required: 'yes', status: 'on-file', evidence: 'SSP-2026 reviewed by State DDW', owner: 'compliance_officer' },
        { item: 'Certified laboratory designated for compliance samples', citation: '40 CFR 141.74 (microbial/chemical analyses by certified lab)', appliesTo: 'CWS/NTNC', required: 'yes', status: 'on-file', evidence: 'NELAP lab #UT-4471', owner: 'compliance_officer' },
        { item: 'Approved analytical methods & monitoring plan', citation: '40 CFR 141.74; 40 CFR Part 141 Subpart C', appliesTo: 'all PWS', required: 'yes', status: 'complete', evidence: 'Methods table on file; online turbidity validated', owner: 'compliance_officer' },
        { item: 'AWIA Risk & Resilience Assessment + Emergency Response Plan certified', citation: 'AWIA §2013 (amends SDWA §1433)', appliesTo: 'CWS > 3,300', required: 'yes', status: 'complete', evidence: 'RRA cert 2025; ERP cert 2025 (incl. cyber/OT)', owner: 'security_officer' },
        { item: 'Consumer Confidence Report program', citation: '40 CFR Part 141 Subpart O', appliesTo: 'CWS', required: 'yes', status: 'complete', evidence: 'CCR published annually', owner: 'compliance_officer' },
        { item: 'Cross-connection control / backflow prevention program', citation: 'State plumbing code; EPA Cross-Connection Control Manual (816-R-03-002)', appliesTo: 'all PWS', required: 'yes', status: 'complete', evidence: 'Annual backflow assembly testing', owner: 'engineer' },
        { item: 'Records retention configured (micro/turbidity ≥5 yr; chemical ≥10 yr)', citation: '40 CFR 141.33', appliesTo: 'all PWS', required: 'yes', status: 'complete', evidence: 'WORM + RAID-6 + offsite (Data Governance)', owner: 'compliance_officer' },
        { item: 'SCADA / OT cybersecurity baseline', citation: 'Within AWIA §2013 RRA; voluntary EPA/CISA & NIST CSF; AWWA guidance', appliesTo: 'all PWS', required: 'yes', status: 'complete', evidence: 'Air-gap + MFA + allowlist; NIST CSF profile', owner: 'security_officer' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'compliance_officer', 'engineer'] }
    },

    // ── EMERGENCY AUTHORIZATIONS (pre-signed capability certificates) ──
    // Actions that cannot wait for an approval workflow in the moment — an
    // EMERGENCY SHUTDOWN, or an immediate FIREFIGHTING DIVERSION — are authorized
    // HERE, BEFOREHAND, with a signed certificate bound to a named holder. During
    // the emergency the holder just executes; the certificate verifies instantly.
    {
      id: 'emergency_auth', name: 'Emergency Authorizations (pre-signed)', icon: '🛑', group: 'Risk',
      desc: 'Pre-authorize, beforehand, who may execute an emergency shutdown or an immediate firefighting diversion. Each row carries a certificate signed by the authorizing body and bound to a holder user-id and scope, so it can be exercised instantly in an emergency without an approval delay. Editable only by Administrator / Security Officer.',
      schema: [
        { key: 'capability', label: 'Capability', type: 'select', options: sel('emergency-shutdown', 'firefighting-diversion') },
        { key: 'holder', label: 'Holder (name)' },
        { key: 'userId', label: 'Holder user-id (non-PII)' },
        { key: 'role', label: 'Designated role' },
        { key: 'scope', label: 'Scope (PWSID or source)' },
        { key: 'authority', label: 'Pre-authorizing authority', type: 'select', options: sel('state-primacy', 'epa-pwss') },
        { key: 'certId', label: 'Certificate #' },
        { key: 'issued', label: 'Issued', type: 'date' },
        { key: 'expires', label: 'Expires', type: 'date' },
        { key: 'cert', label: 'Signed certificate (token)', type: 'textarea' },
        { key: 'status', label: 'Status', type: 'select', options: sel('active', 'revoked', 'expired') }
      ],
      seed: [
        { capability: 'emergency-shutdown', holder: 'J. Rivera', userId: 'U-7F3A', role: 'operator', scope: 'UT18025', authority: 'state-primacy', certId: 'ESC-2026-001', issued: '2026-02-01', expires: '2027-02-01', cert: '', status: 'active' },
        { capability: 'emergency-shutdown', holder: 'M. Vance', userId: 'U-9E07', role: 'security_officer', scope: '*', authority: 'state-primacy', certId: 'ESC-2026-002', issued: '2026-02-01', expires: '2027-02-01', cert: '', status: 'active' },
        { capability: 'firefighting-diversion', holder: 'J. Rivera', userId: 'U-7F3A', role: 'operator', scope: 'NE Pressure-Zone Reservoir', authority: 'state-primacy', certId: 'FFD-2026-014', issued: '2026-02-01', expires: '2027-02-01', cert: '', status: 'active' },
        { capability: 'firefighting-diversion', holder: 'S. Okafor', userId: 'U-2C9D', role: 'compliance_officer', scope: 'South Bench Ground Tank', authority: 'state-primacy', certId: 'FFD-2026-015', issued: '2026-02-01', expires: '2027-02-01', cert: '', status: 'active' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'security_officer'] }
    },

    // ── MANDATORY NOTIFICATIONS (supply shutdown / drain / offline / reduction) ──
    // Reporting is NOT optional. Whenever a water supply is shut down, drained,
    // taken offline, or reduced — planned or unplanned — fire authorities, the
    // primacy agency/regulator, and affected agricultural users MUST be told, so
    // no one can say they did not know a reservoir or tank that could have served
    // their community was unavailable, and so municipalities can act on their own
    // contingency plans. (A public read-only view of NON-classified status is
    // optional; the reporting is not.)
    {
      id: 'notify_external', name: 'Mandatory Notifications (supply events)', icon: '📣', group: 'Operations',
      desc: 'WHO MUST BE NOTIFIED whenever a supply is shut down, drained, taken offline, or reduced (planned or unplanned). Non-optional: fire authorities, the regulator, and affected farms. Basis includes the SDWA Public Notification Rule (40 CFR Part 141 Subpart Q — Tier 1 within 24 h for loss-of-pressure / serious events) plus local fire-flow and mutual-aid agreements.',
      schema: [
        { key: 'party', label: 'Recipient', required: true },
        { key: 'type', label: 'Type', type: 'select', options: sel('fire station', 'fire chief', 'regulator (primacy)', 'emergency management', 'agricultural / farms', 'downstream / consecutive system', 'hospital / critical care', 'mutual-aid', 'public') },
        { key: 'area', label: 'Area / jurisdiction' },
        { key: 'channel', label: 'Channel', type: 'select', options: sel('email', 'SMS', 'phone', 'API / webhook', 'EAS / IPAWS') },
        { key: 'contact', label: 'Contact / endpoint' },
        { key: 'mandatory', label: 'Mandatory', type: 'select', options: sel('yes', 'no') },
        { key: 'basis', label: 'Basis / citation' }
      ],
      seed: [
        { party: 'City Fire Dispatch (Station 1)', type: 'fire station', area: 'Citywide', channel: 'API / webhook', contact: 'https://cad.city.example/hooks/water', mandatory: 'yes', basis: 'Fire-flow dependency; local agreement' },
        { party: 'Fire Chief — duty officer', type: 'fire chief', area: 'Citywide', channel: 'SMS', contact: '+1-555-0911', mandatory: 'yes', basis: 'Incident command; hydrant availability' },
        { party: 'State Division of Drinking Water', type: 'regulator (primacy)', area: 'State', channel: 'email', contact: 'mailto:ddw-notify@state.gov', mandatory: 'yes', basis: 'SDWA Public Notification Rule — 40 CFR Part 141 Subpart Q' },
        { party: 'County Emergency Management', type: 'emergency management', area: 'County', channel: 'EAS / IPAWS', contact: 'IPAWS-COG-UT-014', mandatory: 'yes', basis: 'Emergency alerting; mutual-aid' },
        { party: 'Weber–Davis Irrigation District', type: 'agricultural / farms', area: 'NE service zone', channel: 'email', contact: 'mailto:ops@wbid.example', mandatory: 'yes', basis: 'Curtailment / shortage notice; allocation agreement' },
        { party: 'South Bench consecutive system', type: 'downstream / consecutive system', area: 'South Bench', channel: 'email', contact: 'mailto:ops@southbench.example', mandatory: 'yes', basis: 'Wholesale/consecutive supply dependency' },
        { party: 'Regional Medical Center', type: 'hospital / critical care', area: 'NE service zone', channel: 'phone', contact: '+1-555-0173', mandatory: 'yes', basis: 'Critical-care continuity' },
        { party: 'Public status page', type: 'public', area: 'Public', channel: 'API / webhook', contact: 'https://status.utility.example', mandatory: 'no', basis: 'Optional public read-only (non-classified)' }
      ],
      rbac: { view: ['*'], edit: ['administrator', 'operator', 'compliance_officer', 'security_officer'] }
    }
  ];

  root.HMP_SCHEMAS = { COLLECTIONS };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HMP_SCHEMAS;
}(typeof window !== 'undefined' ? window : globalThis));
