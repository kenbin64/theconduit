/* ============================================================================
 * HydroManifold — UI controller
 * Wires the scale selector + simulator to the DOM: builds one monitoring stack
 * per station, runs the sim loop, paints the manifold health colors, draws the
 * EKG traces, streams the alarm log, and handles fault injection.
 * ========================================================================== */
(function () {
  'use strict';
  const TOP = window.HM_TOPOLOGY, ENG = window.HM_ENGINE, MAN = window.HM_MANIFOLD, SENS = window.HM_SENSORS,
    WEA = window.HM_WEATHER, OPS = window.HM_OPS, PPL = window.HMP_PEOPLE;
  const $ = (id) => document.getElementById(id);
  const sound = PPL ? new PPL.Sound() : { toggle() { return false; }, beep() {} };   // optional, off by default

  let sim = null, ops = null, panels = [], running = true, lastT = 0, textAcc = 0, opsAcc = 0;
  // Human-readable cadences (wall-clock ms). The EKG waveform animates every
  // frame; numbers update calmly so they can actually be read, and the narrative
  // cards update slower still — no strobing, no bouncing panels.
  const TEXT_MS = 1000;     // numerics (readings, z, system health) — ~1 Hz
  const OPS_MS = 3000;      // ops / intelligence cards — every 3 s

  function money(v) {
    const s = v < 0 ? '-' : ''; v = Math.abs(v);
    if (v >= 1e6) return s + '$' + (v / 1e6).toFixed(2) + 'M';
    if (v >= 1e3) return s + '$' + Math.round(v).toLocaleString('en-US');
    return s + '$' + v.toFixed(0);
  }
  const kv = (k, v, cls) => `<div class="kv"><span class="k">${k}</span><span class="v ${cls || ''}">${v}</span></div>`;

  // ── formatting ──
  function fmtCount(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
    if (n >= 1e3) return n.toLocaleString('en-US');
    return String(n);
  }
  function fmtNum(v) { return Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2); }
  const STATUS_CLASS = { healthy: 's-healthy', watch: 's-watch', warning: 's-warning', alarm: 's-alarm', critical: 's-critical' };

  // ── build the tier dropdown ──
  function initTiers() {
    const sel = $('tier');
    TOP.TIERS.forEach((t) => {
      const o = document.createElement('option');
      o.value = t.id; o.textContent = `${t.icon}  ${t.name}`;
      sel.appendChild(o);
    });
    sel.value = 'township';   // a satisfying mid-scale default
    sel.addEventListener('change', () => selectTier(sel.value));
  }

  function initWeather() {
    const sel = $('weather');
    Object.keys(WEA.Weather.SCENARIOS).forEach((id) => {
      const o = document.createElement('option');
      o.value = id; o.textContent = '🌦 ' + WEA.Weather.SCENARIOS[id].label;
      sel.appendChild(o);
    });
    sel.value = 'clear';
    sel.addEventListener('change', () => { if (ops) ops.setWeather(sel.value); });
  }

  // ── (re)build everything for a chosen scale ──
  function selectTier(id) {
    const topo = TOP.buildTopology(id);
    sim = new ENG.Simulator(topo, { speed: Number($('speed').value) });
    ops = new OPS.Ops(sim, { weather: { scenario: $('weather').value || 'clear', auto: true } });
    buildPanels();
    renderCatalog();
    // scale strip
    $('sc-stations').textContent = fmtCount(topo.totals.stations);
    $('sc-sensors').textContent = fmtCount(topo.totals.sensors);
    $('sc-pop').textContent = topo.totals.population ? fmtCount(topo.totals.population) : '—';
    $('sc-demand').textContent = topo.totals.demandMgd >= 1 ? topo.totals.demandMgd.toFixed(0) : topo.totals.demandMgd.toFixed(3);
    // build fixed faceplates, warm a little state, then prime once
    closeDetail();
    lastSortSig = '';
    initOps();
    for (let i = 0; i < 30; i++) sim.tick(40);
    updateText(); updateOps(); renderAlarmLog(); buildFilterBar(); applyFilters(); textAcc = 0; opsAcc = 0;
  }

  // ── one monitoring-stack panel per (representative) station ──
  function buildPanels() {
    const host = $('stations'); host.innerHTML = ''; panels = [];
    sim.stations.forEach((st) => {
      const measures = stationMeasures(st);
      const el = document.createElement('div');
      el.className = 'station';
      el.innerHTML =
        `<div class="hd"><span class="led"></span><span class="icon">${st.icon}</span>
           <span><span class="nm">${st.name}</span> <span class="role">· ${st.role}</span></span>
           <span class="rep">${st.repCount > 1 ? '1 of ' + fmtCount(st.repCount) : 'single'}<br>${st.def.sensors.length} sensors</span></div>
         <div class="healthstrip"><div class="hbar"><div class="hfill"></div></div><div class="hz mono"></div></div>
         <canvas class="ekg"></canvas>
         <div class="reads"></div>
         <div class="predict"></div>
         <div class="faultbtns"></div>`;
      host.appendChild(el);

      const readsEl = el.querySelector('.reads');
      const readRefs = {};
      measures.forEach((m) => {
        const row = document.createElement('div'); row.className = 'read';
        row.innerHTML = `<span class="rl">${labelFor(m)}</span><span class="rv mono">—</span><span class="ru"></span><span class="dot s-healthy"></span>`;
        readsEl.appendChild(row);
        readRefs[m] = { rv: row.querySelector('.rv'), ru: row.querySelector('.ru'), dot: row.querySelector('.dot') };
      });

      // relevant fault buttons only
      const fb = el.querySelector('.faultbtns');
      const avail = [['leak', '💧 Leak'], ['break', '💥 Main break'], ['sensor', '📟 Sensor fault']];
      if (st.cold && (st.readings.freeze != null || st.def.nominal.freeze != null || st.def.nominal.temp != null)) avail.splice(2, 0, ['freeze', '❄ Freeze']);
      if (st.def.nominal.current != null) avail.splice(2, 0, ['pump_trip', '⛔ Pump trip']);
      if (st.def.nominal.chlorine != null || st.def.nominal.turbidity != null) avail.push(['quality', '🧪 Quality upset']);
      avail.forEach(([type, lbl]) => {
        const b = document.createElement('button'); b.textContent = lbl;
        b.addEventListener('click', (ev) => { ev.stopPropagation(); sim.injectFault(st.id, type); });   // don't open the detail
        fb.appendChild(b);
      });

      // fixed value-slots so only individual values change (never reflow)
      const hz = el.querySelector('.hz');
      hz.innerHTML = 'z = <b class="hx">—</b>·<b class="hy">—</b> = <b class="hzv">—</b> · <span class="hst">—</span>';
      const predict = el.querySelector('.predict');
      predict.innerHTML = '<span class="p">—</span>';

      const canvas = el.querySelector('.ekg');
      const panel = {
        st, root: el, led: el.querySelector('.led'),
        hfill: el.querySelector('.hfill'),
        hzx: hz.querySelector('.hx'), hzy: hz.querySelector('.hy'), hzz: hz.querySelector('.hzv'), hst: hz.querySelector('.hst'),
        canvas, ctx: canvas.getContext('2d'), reads: readRefs,
        predictv: predict.querySelector('.p'), measures, stats: {}
      };
      panels.push(panel);
      // click anywhere on the panel → comprehensive single-station detail (min/max)
      el.classList.add('clickable');
      el.addEventListener('click', () => openDetail(panel));
    });
  }

  function stationMeasures(st) {
    const n = st.def.nominal, out = [];
    ['pressure', 'flow', 'level', 'temperature', 'turbidity', 'ph', 'chlorine', 'vibration', 'current', 'leak', 'freeze']
      .forEach((m) => { if (nominalHas(n, m)) out.push(m); });
    return out;
  }
  function nominalHas(n, m) {
    return ({ pressure: n.pressure, flow: n.flow, level: n.level, temperature: n.temp, turbidity: n.turbidity,
      ph: n.ph, chlorine: n.chlorine, vibration: n.vibration, current: n.current, leak: n.leak, freeze: n.freeze }[m]) != null;
  }
  function labelFor(m) { return { temperature: 'temp', chlorine: 'chlorine', vibration: 'vibration', current: 'motor', ph: 'pH' }[m] || m; }

  // ── sensor catalog reference (grouped by licensing tier) ──
  // Must-haves ship out-of-the-box and run by default; nice-to-have and
  // might-get instruments are optional and require additional licensing.
  function renderCatalog() {
    const active = new Set();
    sim.stations.forEach((s) => s.def.sensors.forEach((id) => active.add(id)));

    function section(tierKey) {
      const ids = SENS.SENSOR_TIERS[tierKey];
      const label = { must: 'Core instruments', nice: 'Extended instruments', maybe: 'Specialist instruments' }[tierKey] || tierKey;
      const rows = ids.map((id) => {
        const s = SENS.SENSOR_CATALOG[id]; if (!s) return '';
        const rel = (100 * (1 - SENS.annualFailureRate(id))).toFixed(1);
        const on = active.has(id);
        return `<tr><td class="n">${s.name}</td>
          <td>${on ? '<span class="inc">✓ in use</span>' : '<span class="muted">—</span>'}</td>
          <td class="mono">${rel}%/yr</td><td>${s.accuracy}</td><td>${s.selfDiag ? '✓' : '—'}</td></tr>`;
      }).join('');
      return `<div class="cat-grp"><div class="cat-h"><b>${label}</b></div>
        <table><thead><tr><th>Instrument</th><th>In use</th><th>Reliability</th><th>Accuracy</th><th>Self-diag</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    $('catalog').innerHTML = section('must') + section('nice') + section('maybe');
  }

  // ── live updates — ONLY individual values change; no sentences, no reflow ──
  function updateText() {
    for (const p of panels) {
      const st = p.st, z = st.health.z, col = MAN.colorForHealth(z), status = MAN.statusForHealth(z);
      p.hfill.style.width = (z * 100).toFixed(0) + '%';
      p.hfill.style.background = col;
      // value-slots only (the labels around them never change)
      p.hzx.textContent = st.health.x.toFixed(2);
      p.hzy.textContent = st.health.y.toFixed(2);
      p.hzz.textContent = z.toFixed(2); p.hzz.style.color = col;
      p.hst.textContent = status.label; p.hst.style.color = col;
      p.led.style.background = col; p.led.style.boxShadow = `0 0 9px ${col}`;
      p.root.classList.toggle('crit', status.tier === 'critical');
      p.root.classList.toggle('alarm', status.tier === 'alarm');
      for (const m of p.measures) {
        const r = st.readings[m], ref = p.reads[m]; if (!r || !ref) continue;
        ref.rv.textContent = fmtNum(r.value);
        ref.ru.textContent = r.unit || '';
        ref.dot.className = 'dot ' + (STATUS_CLASS[r.status] || 's-healthy');
        // accumulate min/max/mean for the comprehensive single-station detail
        let acc = p.stats[m]; if (!acc) acc = p.stats[m] = { min: Infinity, max: -Infinity, sum: 0, n: 0, unit: r.unit || '' };
        const v = r.value; if (v < acc.min) acc.min = v; if (v > acc.max) acc.max = v; acc.sum += v; acc.n++; acc.last = v; acc.unit = r.unit || acc.unit; acc.status = r.status;
      }
    }
    if (detailPanel) updateDetail();   // keep an open detail view live
    applyFilters();                    // status filters track live status
    updateTriage();                    // criticals pop up & sort to the front
    // aggregate / system health (values only)
    const agg = sim.aggregate(), col = MAN.colorForHealth(agg.z), status = MAN.statusForHealth(agg.z);
    $('sys-fill').style.width = (agg.z * 100).toFixed(0) + '%';
    $('sys-fill').style.background = col;
    $('sys-z').textContent = agg.z.toFixed(2);
    $('sys-z').style.color = col;
    $('sys-status').textContent = status.label;
    $('sys-status').style.color = col;
    $('clock').textContent = sim._clock();

    // a NEW alarm: chirp + refresh the log. The log only changes when a real new
    // event arrives — so it reads like a log, it doesn't strobe.
    const top = sim.alarmLog[0];
    if (top) {
      const key = top.t + '|' + top.station + '|' + top.msg;
      if (key !== lastAlarmKey) { lastAlarmKey = key; if (sound && (top.sev === 'critical' || top.sev === 'alarm')) sound.beep(top.sev); renderAlarmLog(); }
    }
    updateAlertBlink();
    updateOperatingBanner();
  }

  // The Live alarm log is the ONE place changing text belongs (a log is meant to
  // scroll). Its header blinks while any station is in alarm/critical; the panels
  // themselves only ever change individual values.
  let lastAlarmKey = null;
  function alertCount() {
    let n = 0; for (const st of sim.stations) { const t = MAN.statusForHealth(st.health.z).tier; if (t === 'alarm' || t === 'critical') n++; }
    return n;
  }
  function updateAlertBlink() { const led = $('alarm-blink'); if (led) led.classList.toggle('on', alertCount() > 0); }
  function renderAlarmLog() {
    const host = $('alarms'); if (!host) return;
    let html = '';
    for (let i = 0; i < Math.min(sim.alarmLog.length, 80); i++) {
      const e = sim.alarmLog[i];
      html += `<div class="alarm-row ${e.sev}"><span class="t">${e.t}</span><span class="m"><b>${e.station}</b>${e.msg}</span></div>`;
    }
    host.innerHTML = html || '<div class="muted" style="padding:10px">No alerts logged.</div>';
  }
  // Alert report: a calm snapshot of which stations need attention (updated on the
  // slow ops cadence, in the alert area — never in the value panels).
  function renderAlertReport() {
    const host = $('alertreport'); if (!host) return;
    const trouble = sim.stations.filter((st) => { const t = MAN.statusForHealth(st.health.z).tier; return t === 'alarm' || t === 'critical'; });
    if (!trouble.length) { host.innerHTML = '<div class="ar-ok">✓ All stations nominal</div>'; return; }
    host.innerHTML = trouble.map((st) => { const s = MAN.statusForHealth(st.health.z); return `<div class="ar-row ${s.tier}"><b>${st.name}</b> · ${s.label} · z=${st.health.z.toFixed(2)}</div>`; }).join('');
  }

  // ── comprehensive single-station detail (click any panel) — current + min/max/mean ──
  let detailPanel = null, detailAdvSig = '';
  function openDetail(panel) {
    detailPanel = panel; detailAdvSig = ''; const st = panel.st;
    const rows = panel.measures.map((m) => `<tr><td class="dl">${labelFor(m)}</td><td class="mono" id="d-${m}-cur">—</td><td class="mono" id="d-${m}-min">—</td><td class="mono" id="d-${m}-max">—</td><td class="mono" id="d-${m}-mean">—</td><td class="du" id="d-${m}-u"></td><td><span class="dot" id="d-${m}-dot"></span></td></tr>`).join('');
    $('detail-title').textContent = st.icon + ' ' + st.name;
    $('detail-sub').textContent = st.role + ' · ' + st.def.sensors.length + ' sensors' + (st.repCount > 1 ? ' · representative of ' + fmtCount(st.repCount) : '');
    $('detail-body').innerHTML = `<table class="dtl"><thead><tr><th>Sensor</th><th>Current</th><th>Min</th><th>Max</th><th>Mean</th><th>Unit</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      <div class="dtl-sub">Predictive advisories</div><div class="dtl-adv" id="detail-adv"></div>
      <div class="note" style="margin-top:8px">Min / Max / Mean accumulate over the time this scale has been monitored. In a real deployment, thresholds &amp; actions are set by your policy; this shows what the system can surface. Inject a fault on the panel to watch it respond.</div>`;
    $('detail').classList.add('open');
    updateDetail();
  }
  function updateDetail() {
    if (!detailPanel) return; const p = detailPanel, st = p.st, status = MAN.statusForHealth(st.health.z);
    const zel = $('detail-z'); if (zel) { zel.textContent = 'z = ' + st.health.x.toFixed(2) + '·' + st.health.y.toFixed(2) + ' = ' + st.health.z.toFixed(2) + ' · ' + status.label; zel.style.color = MAN.colorForHealth(st.health.z); }
    for (const m of p.measures) {
      const s = p.stats[m]; if (!s) continue;
      const set = (suf, val) => { const el = $('d-' + m + '-' + suf); if (el) el.textContent = val; };
      set('cur', s.last != null ? fmtNum(s.last) : '—');
      set('min', isFinite(s.min) ? fmtNum(s.min) : '—');
      set('max', isFinite(s.max) ? fmtNum(s.max) : '—');
      set('mean', s.n ? fmtNum(s.sum / s.n) : '—');
      set('u', s.unit || '');
      const dot = $('d-' + m + '-dot'); if (dot) dot.className = 'dot ' + (STATUS_CLASS[s.status] || 's-healthy');
    }
    // advisories — refresh only when they actually change (no churn)
    const preds = st.predictions || [];
    const sig = preds.map((pr) => pr.kind + pr.msg).join('|');
    if (sig !== detailAdvSig) {
      detailAdvSig = sig;
      const adv = $('detail-adv');
      if (adv) adv.innerHTML = preds.length ? preds.map((pr) => `<div class="adv ${pr.sev || ''}">${pr.msg}</div>`).join('') : '<div class="adv-ok">No predictive advisories — within forecast envelope.</div>';
    }
  }
  function closeDetail() { detailPanel = null; const d = $('detail'); if (d) d.classList.remove('open'); }

  // ── filter / arrange the station grid by category and by status ──
  const filter = { category: 'all', status: 'all' };
  function applyFilters() {
    for (const p of panels) {
      const st = p.st, tier = MAN.statusForHealth(st.health.z).tier;
      const catOk = filter.category === 'all' || st.type === filter.category;
      const f = filter.status;
      const statusOk = f === 'all' || (f === 'failures' ? (tier === 'alarm' || tier === 'critical') : tier === f);
      p.root.classList.toggle('hidden', !(catOk && statusOk));
    }
  }
  function buildFilterBar() {
    const types = Array.from(new Set(sim.stations.map((s) => s.type)));
    if (types.indexOf(filter.category) < 0) filter.category = 'all';
    const csel = $('flt-cat');
    if (csel) { csel.innerHTML = '<option value="all">All categories</option>' + types.map((t) => `<option value="${t}">${t}</option>`).join(''); csel.value = filter.category; }
    document.querySelectorAll('#filterbar [data-status]').forEach((b) => b.classList.toggle('on', b.getAttribute('data-status') === filter.status));
  }

  // ── triage: CRITICAL pops up and sorts to the front (displacing healthy);
  //    ALARM is surfaced too; WARNING only acknowledges that warnings exist ──
  const SEV_RANK = { critical: 4, alarm: 3, warning: 2, watch: 1, healthy: 0 };
  function sevRankOf(st) { return SEV_RANK[MAN.statusForHealth(st.health.z).tier] || 0; }
  let lastSortSig = '', critFirst = null;
  function sortBySeverity() {
    const host = $('stations'); if (!host) return;
    const ordered = panels.map((p, i) => ({ p, i, r: sevRankOf(p.st) })).sort((a, b) => (b.r - a.r) || (a.i - b.i));
    const sig = ordered.map((o) => o.p.st.id + ':' + o.r).join('|');
    if (sig === lastSortSig) return;          // only reorder the DOM when the ranking actually changes
    lastSortSig = sig;
    ordered.forEach((o) => host.appendChild(o.p.root));   // criticals/alarms float to the top
  }
  function updateTriage() {
    const crit = []; let alarmN = 0, warnN = 0;
    for (const st of sim.stations) {
      const t = MAN.statusForHealth(st.health.z).tier;
      if (t === 'critical') crit.push(st); else if (t === 'alarm') alarmN++; else if (t === 'warning') warnN++;
    }
    const banner = $('critbanner');
    if (banner) {
      if (crit.length) {
        banner.classList.add('on');
        banner.innerHTML = `<span class="cb-tag">🚨 CRITICAL (${crit.length})</span><span class="cb-names">${crit.map((s) => s.name).join(' · ')}</span><span class="cb-act">— immediate attention · click to open</span>`;
        critFirst = crit[0];
      } else { banner.classList.remove('on'); banner.innerHTML = ''; critFirst = null; }
    }
    const wa = $('warnack');
    if (wa) {
      const parts = [];
      if (alarmN) parts.push('⛔ ' + alarmN + ' alarm' + (alarmN > 1 ? 's' : ''));
      if (warnN) parts.push('⚠ ' + warnN + ' warning' + (warnN > 1 ? 's' : '') + ' present');
      wa.textContent = parts.join('  ·  ');
      wa.classList.toggle('show', parts.length > 0);
    }
    sortBySeverity();
  }

  // Reflect the operating mode set by the Operations Center: real-time operation
  // is LOCKED here until a signed authorization is installed AND deployed. The
  // live app re-verifies the authorization itself — it never trusts a bare flag.
  function updateOperatingBanner() {
    const bar = $('demobar'); if (!bar || !window.HM_LICENSE) return;
    const s = window.HM_LICENSE.liveStatus({});
    if (s.canOperateLive) {
      const pwsid = (s.authorization && s.authorization.pws && s.authorization.pws.pwsid) || '';
      bar.className = 'demobar live';
      bar.innerHTML = '<span class="simblink" style="color:#27e07a">● AUTHORIZED REAL-TIME OPERATION</span> ' +
        'PWSID <b>' + pwsid + '</b> · ' + (s.authorityName || '') +
        ' — operating authorization verified &amp; deployed. <span style="opacity:.8">(Telemetry in this portfolio build remains simulated.)</span>';
    } else {
      bar.className = 'demobar';
      bar.innerHTML = '<span class="simblink">● SIMULATED MONITORING</span> Real-time operation is <b>LOCKED</b> — ' +
        String(s.reason || '') + '. Set up &amp; commission in the Operations Center, then deploy. Demonstration / simulation only.';
    }
  }

  // ── EKG render (every frame) ──
  function drawEKGs() {
    for (const p of panels) {
      const c = p.canvas, ctx = p.ctx, st = p.st;
      const w = c.clientWidth || 320, h = 78;
      if (c.width !== w) c.width = w; if (c.height !== h) c.height = h;
      ctx.clearRect(0, 0, w, h);
      // grid
      ctx.strokeStyle = 'rgba(40,70,100,.35)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < w; x += 28) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
      for (let y = h / 4; y < h; y += h / 4) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
      ctx.stroke();
      // trace
      const buf = st.signal, len = buf.length, mid = h * 0.55, amp = h * 0.42;
      const col = MAN.colorForHealth(st.health.z);
      ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.shadowColor = col; ctx.shadowBlur = 6;
      ctx.beginPath();
      for (let i = 0; i < len; i++) {
        const idx = (st.sigHead + i) % len;
        const x = (i / (len - 1)) * w;
        const y = mid - buf[idx] * amp;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke(); ctx.shadowBlur = 0;
      // leading dot
      const lastIdx = (st.sigHead + len - 1) % len;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(w - 2, mid - buf[lastIdx] * amp, 2.5, 0, 7); ctx.fill();
    }
  }

  // ── operations & intelligence cards — fixed faceplates, VALUES ONLY ──
  const hourLabel = (h) => String(Math.floor(h)).padStart(2, '0') + ':00';
  const kvr = (label, id) => `<div class="kv"><span class="k">${label}</span><span class="v mono" id="${id}">—</span></div>`;
  function setv(id, text, cls) { const el = $(id); if (!el) return; el.textContent = text; el.className = 'v mono' + (cls ? ' ' + cls : ''); }

  // Build the fixed label→value structure ONCE (per tier (re)build). Afterwards
  // only the value spans change — labels never move, nothing reflows.
  function initOps() {
    $('op-weather').innerHTML = kvr('Condition', 'v-wx-cond') + kvr('Air temp', 'v-wx-temp') + kvr('Drought index', 'v-wx-drought') + kvr('Demand', 'v-wx-demand');
    $('op-usage').innerHTML = kvr('Current draw', 'v-us-draw') + kvr('Flow', 'v-us-flow') + kvr('Per capita', 'v-us-pc') + kvr('Per connection', 'v-us-conn') + kvr('Forecast peak', 'v-us-peak');
    $('op-econ').innerHTML = kvr('Spent today', 'v-ec-spent') + kvr('Daily budget', 'v-ec-budget') + kvr('Overrun', 'v-ec-over') + kvr('Savings today', 'v-ec-save') + kvr('Delivered', 'v-ec-deliv') + kvr('Lost to leaks', 'v-ec-lost');
    $('op-market').innerHTML = kvr('Spot ($/AF)', 'v-mk-spot') + kvr('≈ per MG', 'v-mk-permg') + kvr('Futures (12 mo)', 'v-mk-fut');
    $('op-supply').innerHTML = kvr('Blended cost', 'v-sp-blend') + kvr('Chemical resupply', 'v-sp-chem') + kvr('Suppliers online', 'v-sp-sup') + kvr('Active dispatches', 'v-sp-disp');
    $('op-ai').innerHTML = kvr('Anomalies', 'v-ai-anom') + kvr('Maintenance alerts', 'v-ai-maint') + kvr('Load balance', 'v-ai-load') + kvr('Headroom', 'v-ai-head');
    $('op-recovery').innerHTML = kvr('Active incidents', 'v-rc-inc') + kvr('Outage areas', 'v-rc-out') + kvr('Recovery plans active', 'v-rc-plan') + kvr('Failsafes', 'v-rc-fail');
  }

  function updateOps() {
    if (!ops || !ops.state || !ops.state.usage) return;
    const s = ops.state, e = s.econ, a = s.analysis, u = s.usage, w = s.weather;
    const demandTok = { heatwave: '+45% (heat)', hot: 'elevated', drought: 'source −', storm: 'turbidity ↑', rain: 'demand ↓', hardfreeze: 'freeze HIGH', cold: 'freeze ↑', clear: 'nominal' }[w.scenario] || 'nominal';
    setv('v-wx-cond', w.label);
    setv('v-wx-temp', w.airTempF.toFixed(0) + ' °F');
    setv('v-wx-drought', (w.droughtIdx * 100).toFixed(0) + ' %', w.droughtIdx > 0.5 ? 'bad' : '');
    setv('v-wx-demand', demandTok, (w.scenario === 'hardfreeze' || w.droughtIdx > 0.5) ? 'warn' : '');

    setv('v-us-draw', u.instMgd.toFixed(u.instMgd < 1 ? 4 : 2) + ' MGD');
    setv('v-us-flow', Math.round(u.instGpm).toLocaleString('en-US') + ' GPM');
    setv('v-us-pc', u.perCapitaGpd ? Math.round(u.perCapitaGpd) + ' gpd' : '—');
    setv('v-us-conn', u.perConnectionGpd ? Math.round(u.perConnectionGpd) + ' gpd' : '—');
    setv('v-us-peak', s.peak.mgd.toFixed(s.peak.mgd < 1 ? 3 : 2) + ' MGD @ ' + hourLabel(s.peak.hour));
    drawForecast($('op-forecast'), s.forecast, s.peak);

    setv('v-ec-spent', money(e.dayCost));
    setv('v-ec-budget', money(e.budgetDaily));
    setv('v-ec-over', money(e.dayOverrun) + ' (' + (e.overrunPct >= 0 ? '+' : '') + e.overrunPct.toFixed(0) + '%)', e.overrunPct > 8 ? 'bad' : e.overrunPct > 0 ? 'warn' : 'good');
    setv('v-ec-save', money(e.daySavings), 'good');
    setv('v-ec-deliv', e.mgDelivered.toFixed(2) + ' MG');
    setv('v-ec-lost', e.mgLost.toFixed(3) + ' MG', e.mgLost > 0.001 ? 'bad' : '');

    setv('v-mk-spot', money(e.spotAF));
    setv('v-mk-permg', money(e.spotPerMg));
    const lf = e.futures && e.futures.length ? e.futures[e.futures.length - 1] : null;
    setv('v-mk-fut', lf ? money(lf.priceAF) + ' /AF' : '—');

    setv('v-sp-blend', money(e.supply.blendedPerMg) + ' /MG');
    setv('v-sp-chem', e.chemDaysLeft.toFixed(1) + ' days', e.chemDaysLeft < 3 ? 'warn' : '');
    setv('v-sp-sup', String(e.supply.mix.length));
    setv('v-sp-disp', String(e.dispatches.length), e.dispatches.length ? 'warn' : '');

    setv('v-ai-anom', String(a.anomalies.length), a.anomalies.length ? 'warn' : 'good');
    setv('v-ai-maint', String(a.maintenance.length), a.maintenance.length ? 'warn' : 'good');
    setv('v-ai-load', a.loadBalance.status, a.loadBalance.status === 'balanced' ? 'good' : a.loadBalance.status === 'deficit' ? 'crit' : 'warn');
    setv('v-ai-head', a.loadBalance.headroomPct + ' %');

    const incidents = a.outages.length + a.recovery.length;
    setv('v-rc-inc', String(incidents), incidents ? 'bad' : 'good');
    setv('v-rc-out', String(a.outages.length), a.outages.length ? 'bad' : '');
    setv('v-rc-plan', String(a.recovery.length), a.recovery.length ? 'warn' : '');
    setv('v-rc-fail', 'armed', 'good');

    renderAlertReport();     // calm snapshot, in the alert area (not the value panels)
  }

  function drawForecast(c, fc, peak) {
    if (!c || !fc || !fc.length) return;
    const w = c.clientWidth || 280, h = 70; if (c.width !== w) c.width = w; if (c.height !== h) c.height = h;
    const ctx = c.getContext('2d'); ctx.clearRect(0, 0, w, h);
    let max = 0; fc.forEach((p) => { if (p.hi > max) max = p.hi; }); max = max || 1;
    const X = (i) => (i / (fc.length - 1)) * w, Y = (v) => h - 6 - (v / max) * (h - 12);
    // confidence band
    ctx.fillStyle = 'rgba(63,208,255,.14)'; ctx.beginPath();
    fc.forEach((p, i) => { const x = X(i), y = Y(p.hi); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    for (let i = fc.length - 1; i >= 0; i--) ctx.lineTo(X(i), Y(fc[i].lo)); ctx.closePath(); ctx.fill();
    // mid line
    ctx.strokeStyle = 'var(--accent)'; ctx.strokeStyle = '#3fd0ff'; ctx.lineWidth = 1.6; ctx.beginPath();
    fc.forEach((p, i) => { const x = X(i), y = Y(p.mgd); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
    // peak marker
    const pi = fc.indexOf(peak); if (pi >= 0) { ctx.fillStyle = '#ffc233'; ctx.beginPath(); ctx.arc(X(pi), Y(peak.mgd), 3, 0, 7); ctx.fill(); }
  }

  // ── main loop ──
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = lastT ? now - lastT : 16; lastT = now;
    if (running && sim && ops) {
      ops.step(Math.min(dt, 80));        // steps weather → engine → analysis → economics
      drawEKGs();                        // waveform animates every frame (continuous)
      textAcc += dt; opsAcc += dt;
      if (textAcc >= TEXT_MS) { updateText(); textAcc = 0; }   // numbers ~1 Hz
      if (opsAcc >= OPS_MS) { updateOps(); opsAcc = 0; }       // narrative every 3 s
    }
  }

  // ── controls ──
  function initControls() {
    $('play').addEventListener('click', () => {
      running = !running;
      $('play').textContent = running ? '⏸ Pause' : '▶ Resume';
    });
    $('speed').addEventListener('input', () => {
      $('speedlbl').textContent = $('speed').value + '×';
      if (sim) sim.speed = Number($('speed').value);
    });
    $('inject').addEventListener('click', () => {
      if (!sim || !sim.stations.length) return;
      const st = sim.stations[Math.floor(Math.random() * sim.stations.length)];
      const types = ['leak', 'break', 'freeze', 'pump_trip', 'sensor', 'quality'];
      sim.injectFault(st.id, types[Math.floor(Math.random() * types.length)]);
    });
    $('clear').addEventListener('click', () => sim && sim.clearFaults());
    if ($('sound')) $('sound').addEventListener('click', () => {
      const on = sound.toggle();
      $('sound').textContent = on ? '🔔 Alerts' : '🔕 Alerts';
      if (on) sound.beep('warning');
    });
    function setWall(on) {
      document.body.classList.toggle('wall', on);
      if ($('wall-exit')) $('wall-exit').style.display = on ? '' : 'none';
      try {
        if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
        else if (!on && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
      } catch (_) {}
    }
    if ($('wall')) $('wall').addEventListener('click', () => setWall(!document.body.classList.contains('wall')));
    if ($('wall-exit')) $('wall-exit').addEventListener('click', () => setWall(false));
    // leaving browser fullscreen (Esc) should also drop wall mode
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('wall')) setWall(false); });

    // single-station detail: close button + backdrop click + Esc
    if ($('detail-x')) $('detail-x').addEventListener('click', closeDetail);
    if ($('detail')) $('detail').addEventListener('click', (ev) => { if (ev.target === $('detail')) closeDetail(); });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeDetail(); });

    // grid filters: status buttons + category select
    document.querySelectorAll('#filterbar [data-status]').forEach((b) => b.addEventListener('click', () => { filter.status = b.getAttribute('data-status'); buildFilterBar(); applyFilters(); }));
    if ($('flt-cat')) $('flt-cat').addEventListener('change', () => { filter.category = $('flt-cat').value; applyFilters(); });

    // click the critical banner → open the first critical station's detail
    if ($('critbanner')) $('critbanner').addEventListener('click', () => { if (critFirst) { const p = panels.find((pp) => pp.st === critFirst); if (p) openDetail(p); } });
  }

  // ── boot ──
  if (window.HM_THEME) { window.HM_THEME.mount($('theme'), $('accent')); window.HM_THEME.applyBrand(); }   // your theme + your brand
  initTiers();
  initWeather();
  initControls();
  selectTier($('tier').value);
  requestAnimationFrame(loop);
})();
