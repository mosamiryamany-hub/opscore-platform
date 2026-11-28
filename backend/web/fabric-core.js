/* OpsCore Command Fabric — shared client runtime (v4)
   No inline handlers, no external deps, CSP-safe, RTL-aware.
   Honesty rule: every number rendered here comes from a live same-origin probe
   made in this page session; synthetic geometry is labelled as decorative. */
(() => {
  'use strict';

  const doc = document;
  const root = doc.documentElement;
  const store = window.localStorage;

  /* ---------- tiny helpers ---------- */
  const $ = (sel, scope) => (scope || doc).querySelector(sel);
  const $$ = (sel, scope) => Array.prototype.slice.call((scope || doc).querySelectorAll(sel));
  const on = (el, ev, fn, opt) => el && el.addEventListener(ev, fn, opt);
  const el = (tag, cls, txt) => {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  };

  /* ---------- direction / language ---------- */
  const DIR_KEY = 'opscore.dir';
  function applyDir(dir) {
    root.setAttribute('dir', dir);
    root.setAttribute('lang', dir === 'rtl' ? 'ar' : 'en');
    $$('[data-dir-toggle]').forEach(b => {
      b.textContent = dir === 'rtl' ? 'EN' : 'ع';
      b.setAttribute('aria-label', dir === 'rtl' ? 'Switch interface to English' : 'تحويل الواجهة إلى العربية');
    });
  }
  function initDir() {
    let d = store.getItem(DIR_KEY);
    if (d !== 'rtl' && d !== 'ltr') {
      d = (navigator.language || 'en').toLowerCase().indexOf('ar') === 0 ? 'rtl' : 'ltr';
    }
    applyDir(d);
    $$('[data-dir-toggle]').forEach(b => on(b, 'click', () => {
      const next = root.getAttribute('dir') === 'rtl' ? 'ltr' : 'rtl';
      store.setItem(DIR_KEY, next);
      applyDir(next);
    }));
  }

  /* ---------- reveal ---------- */
  function initReveal() {
    const nodes = dataNodes('[data-reveal]');
    if (!('IntersectionObserver' in window)) { nodes.forEach(n => n.classList.add('is-in')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    nodes.forEach((n, i) => {
      n.style.transitionDelay = (Math.min(i, 12) * 45) + 'ms';
      io.observe(n);
    });
  }
  function dataNodes(sel) {
    const out = [];
    for (let i = 0; i < arguments.length; i++) { }
    return $$(sel);
  }

  /* ---------- toasts ---------- */
  let toastHost = null;
  function toast(msg, kind) {
    if (!toastHost) {
      toastHost = doc.body.querySelector('.toasts') || el('div', 'toasts');
      toastHost.setAttribute('aria-live', 'polite');
      if (!toastHost.parentNode) doc.body.appendChild(toastHost);
    }
    const t = el('div', 'toast' + (kind ? ' toast--' + kind : ''), msg);
    toastHost.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(6px)'; }, 3600);
    setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 4100);
  }

  /* ---------- command palette ---------- */
  const NAV = [
    { label: 'Operations Overview', hint: 'home', href: '/', k: 'H' },
    { label: 'Control Plane', hint: 'authenticated state board', href: '/control-plane.html', k: 'P' },
    { label: 'Control Rooms', hint: 'operator rooms', href: '/control-rooms.html', k: 'R' },
    { label: 'Contact Center', hint: 'governed conversations', href: '/contact-center.html', k: 'C' },
    { label: 'Contact Center Control Room', hint: 'agent queue and assignments', href: '/contact-center-room.html', k: 'A' },
    { label: 'Customer Portal', hint: 'tenant portal', href: '/portal.html', k: 'T' },
    { label: 'Release Proof', hint: 'verify /release', href: '/verify/release.html', k: '1' },
    { label: 'Deployment Proof', hint: 'verify /deployment', href: '/verify/deployment.html', k: '2' },
    { label: 'Database Proof', hint: 'verify /database', href: '/verify/database.html', k: '3' },
    { label: 'Health JSON', hint: 'api/health', href: '/api/health', k: '4' }
  ];

  function initPalette() {
    const host = el('div', 'palette');
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'true');
    host.setAttribute('aria-label', 'Command palette');
    host.innerHTML =
      '<div class="palette__box">' +
      '<div class="palette__input"><span class="mono tiny muted">⌘K</span>' +
      '<input type="search" placeholder="Jump to a surface or action…" aria-label="Command palette search" autocomplete="off"></div>' +
      '<div class="palette__list" role="listbox" aria-label="Command palette results"></div>' +
      '<div class="palette__hint"><span>↑ ↓ move</span><span>↵ open</span><span>esc close</span></div></div>';
    doc.body.appendChild(host);
    const input = host.querySelector('input');
    const list = host.querySelector('.palette__list');
    let items = NAV.slice();
    let active = 0;

    function paint() {
      list.innerHTML = '';
      if (!items.length) { list.appendChild(el('div', 'palette__item', 'No match')); return; }
      items.forEach((it, i) => {
        const row = el('a', 'palette__item' + (i === active ? ' is-active' : ''));
        row.href = it.href;
        row.setAttribute('role', 'option');
        const b = el('b', null, it.label);
        row.appendChild(b);
        row.appendChild(el('span', 'tiny muted', it.hint));
        row.appendChild(el('kbd', 'kbd', it.k));
        on(row, 'mouseenter', () => { active = i; paint(); });
        list.appendChild(row);
      });
    }
    function filter(q) {
      const s = q.trim().toLowerCase();
      items = !s ? NAV.slice() : NAV.filter(it =>
        (it.label + ' ' + it.hint).toLowerCase().indexOf(s) >= 0);
      active = 0; paint();
    }
    function open() {
      host.classList.add('is-open');
      filter('');
      setTimeout(() => input.focus(), 40);
    }
    function close() { host.classList.remove('is-open'); }

    on(input, 'input', () => filter(input.value));
    on(host, 'click', e => { if (e.target === host) close(); });
    on(doc, 'keydown', e => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); host.classList.contains('is-open') ? close() : open(); return; }
      if (e.key === 'Escape' && host.classList.contains('is-open')) { e.preventDefault(); close(); return; }
      if (!host.classList.contains('is-open')) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, items.length - 1); paint(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); paint(); }
      else if (e.key === 'Enter' && items[active]) { e.preventDefault(); window.location.href = items[active].href; }
    });
    $$('[data-palette]').forEach(b => on(b, 'click', open));
  }

  /* ---------- canvas sparkline (real samples only) ---------- */
  function spark(canvas, series, opts) {
    if (!canvas || !series || series.length < 2) return;
    const o = opts || {};
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 220;
    const h = canvas.clientHeight || 34;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const min = Math.min.apply(null, series);
    const max = Math.max.apply(null, series);
    const span = (max - min) || 1;
    const pad = 3;
    const pts = series.map((v, i) => [
      pad + (i * (w - pad * 2)) / (series.length - 1),
      h - pad - ((v - min) / span) * (h - pad * 2)
    ]);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, o.fill || 'rgba(77,226,255,.34)');
    grad.addColorStop(1, 'rgba(77,226,255,0)');
    ctx.beginPath();
    ctx.moveTo(pts[0][0], h);
    pts.forEach(p => ctx.lineTo(p[0], p[1]));
    ctx.lineTo(pts[pts.length - 1][0], h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = o.stroke || '#4de2ff';
    ctx.shadowColor = o.stroke || '#4de2ff';
    ctx.shadowBlur = 7;
    ctx.stroke();
    ctx.shadowBlur = 0;
    const last = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(last[0], last[1], 2.4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }

  /* ---------- decorative core radar ---------- */
  function initCore() {
    const c = $('#coreCanvas');
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let t = 0;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function frame() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const size = c.clientWidth || 360;
      if (c.width !== Math.round(size * dpr)) {
        c.width = Math.round(size * dpr); c.height = Math.round(size * dpr);
      }
      const S = c.width, cx = S / 2, cy = S / 2, R = S * 0.44;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, S, S);
      // rings
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, (R * i) / 3, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(124,160,255,' + (0.16 - i * 0.03) + ')';
        ctx.lineWidth = dpr;
        ctx.stroke();
      }
      // spokes
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + t * 0.12;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * R * 0.16, cy + Math.sin(a) * R * 0.16);
        ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        ctx.strokeStyle = 'rgba(124,160,255,.07)';
        ctx.stroke();
      }
      // sweep
      const sweep = t % (Math.PI * 2);
      const g = ctx.createConicGradient ? ctx.createConicGradient(sweep, cx, cy) : null;
      if (g) {
        g.addColorStop(0, 'rgba(77,226,255,.34)');
        g.addColorStop(0.12, 'rgba(77,226,255,0)');
        g.addColorStop(1, 'rgba(77,226,255,0)');
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }
      // nodes
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + t * 0.35;
        const rr = R * (0.42 + 0.34 * Math.sin(t * 0.9 + i));
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
        ctx.beginPath();
        ctx.arc(x, y, 2.1 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 ? 'rgba(155,123,255,.95)' : 'rgba(77,226,255,.95)';
        ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10 * dpr;
        ctx.fill(); ctx.shadowBlur = 0;
      }
      t += reduce ? 0.002 : 0.010;
      if (!reduce) window.requestAnimationFrame(frame);
    }
    frame();
  }

  /* ---------- live probes ---------- */
  const state = { latency: [], health: null, release: null };

  function setPill(node, kind, text) {
    if (!node) return;
    node.className = 'pill' + (kind ? ' ' + kind : '');
    node.textContent = '';
    node.appendChild(el('span', 'dot'));
    node.appendChild(doc.createTextNode(text));
  }

  async function probe() {
    const t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    let res = null, ok = false;
    try {
      res = await fetch('/api/health', { headers: { accept: 'application/json' }, cache: 'no-store' });
      ok = res.ok;
    } catch (e) { ok = false; }
    const t1 = (window.performance && performance.now) ? performance.now() : Date.now();
    const ms = Math.max(1, Math.round(t1 - t0));

    let body = null;
    if (res) { try { body = await res.json(); } catch (e) { body = null; } }
    state.health = body;
    state.latency.push(ms);
    if (state.latency.length > 40) state.latency.shift();

    const okNow = ok && body && (body.status === 'healthy' || body.ok === true);
    setPill($('#livePill'), okNow ? 'ok' : (ok ? 'warn' : 'bad'),
      okNow ? 'RUNTIME · LIVE' : (ok ? 'RUNTIME · DEGRADED' : 'RUNTIME · UNREACHABLE'));

    const map = [
      ['#mStatus', body && body.status ? String(body.status).toUpperCase() : (okNow ? 'HEALTHY' : (res ? 'HTTP ' + res.status : 'OFFLINE'))],
      ['#mEngine', body && body.engine ? String(body.engine).toUpperCase() : '—'],
      ['#mVer', body && body.version ? String(body.version) : '—'],
      ['#mLat', ms + 'ms']
    ];
    map.forEach(([sel, val]) => { const n = $(sel); if (n) n.textContent = val; });
    const coreStatus = $('#mStatusCore');
    if (coreStatus) coreStatus.textContent = body && body.status ? String(body.status).toUpperCase() : (okNow ? 'HEALTHY' : (res ? 'HTTP ' + res.status : 'OFFLINE'));
    const heroStatus = $('#mStatusHero');
    if (heroStatus) heroStatus.textContent = okNow ? String(body.status || 'healthy').toUpperCase() : (body && body.status ? String(body.status).toUpperCase() : (res ? 'HTTP ' + res.status : 'OFFLINE'));

    const sub = $('#mStatusSub');
    if (sub) sub.textContent = okNow ? 'Live same-origin probe' : 'Probe did not confirm health';

    const latNode = $('#mLatSub');
    if (latNode) {
      const s = state.latency;
      const avg = Math.round(s.reduce((a, b) => a + b, 0) / s.length);
      latNode.textContent = 'median of ' + s.length + ' sample' + (s.length === 1 ? '' : 's') + ' · mean ' + avg + 'ms';
    }
    ['#latencySpark', '#sparkLat'].forEach(sel => spark($(sel), state.latency));
    const rails = $$('[data-probe="health"]');
    rails.forEach(n => { n.className = 'rail__item ' + (okNow ? 'is-ok' : (res ? 'is-warn' : 'is-bad')); });
    const hv = $('[data-probe-val="health"]');
    if (hv) hv.textContent = body && body.status ? String(body.status).toLowerCase() + ' · ' + ms + 'ms' : (okNow ? 'healthy · ' + ms + 'ms' : (res ? 'HTTP ' + res.status : 'no response'));
  }

  async function probeRelease() {
    try {
      const r = await fetch('/api/verify/release', { headers: { accept: 'application/json' }, cache: 'no-store' });
      const j = await r.json();
      state.release = j;
      const st = String(j.status || '').toUpperCase();
      const node = $('[data-probe="release"]');
      const val = $('[data-probe-val="release"]');
      if (node) node.className = 'rail__item ' + (st === 'PASS' ? 'is-ok' : (st === 'UNVERIFIED' ? 'is-warn' : 'is-bad'));
      if (val) val.textContent = st.toLowerCase() + (j.sourceCommit ? ' · ' + String(j.sourceCommit).slice(0, 12) : '');
      const chip = $('#releaseChip');
      if (chip) chip.textContent = st || '—';
      const commitNode = $('#commitChip');
      if (commitNode && j.sourceCommit) commitNode.textContent = String(j.sourceCommit).slice(0, 12);
      const depNode = $('#deployChip');
      if (depNode && j.deployment) depNode.textContent = String(j.deployment).slice(0, 22);
    } catch (e) {
      const node = $('[data-probe="release"]');
      if (node) node.className = 'rail__item is-bad';
      const val = $('[data-probe-val="release"]');
      if (val) val.textContent = 'unreachable';
    }
  }

  function initProbes() {
    if (!$('#livePill') && !$('[data-probe]')) return;
    probe(); probeRelease();
    setInterval(probe, 20000);
    setInterval(probeRelease, 60000);
    on(window, 'resize', () => spark($('#latencySpark'), state.latency));
  }

  /* ---------- clock ---------- */
  function initClock() {
    const nodes = $$('[data-clock]');
    if (!nodes.length) return;
    const tick = () => {
      const d = new Date();
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      const ss = String(d.getUTCSeconds()).padStart(2, '0');
      nodes.forEach(n => { n.textContent = hh + ':' + mm + ':' + ss + ' UTC'; });
    };
    tick(); setInterval(tick, 1000);
  }

  /* ---------- boot ---------- */
  function boot() {
    initDir();
    initReveal();
    initPalette();
    initCore();
    initProbes();
    initClock();
    window.OpsFabric = { toast, spark, probe, state };
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
