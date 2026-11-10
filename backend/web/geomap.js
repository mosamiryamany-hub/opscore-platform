'use strict';
/*
 * OpsCore GeoMap — dependency-free interactive map (CSP: script-src 'self').
 * Web Mercator (EPSG:3857) projection, optional XYZ raster tiles, offline
 * graticule basemap, GPS accuracy circles, geofence polygons, clustering,
 * pan / wheel / pinch / keyboard. Distances are great-circle (not road ETA).
 */
(function (root) {
  const TILE = 256, MAX_LAT = 85.0511287798, EARTH_C = 40075016.686;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const validLL = (lng, lat) => Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90;

  function project(lng, lat, z) {
    const s = TILE * 2 ** z, sin = Math.sin(clamp(lat, -MAX_LAT, MAX_LAT) * Math.PI / 180);
    return [(lng + 180) / 360 * s, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s];
  }
  function unproject(x, y, z) {
    const s = TILE * 2 ** z, n = Math.PI - 2 * Math.PI * y / s;
    return [x / s * 360 - 180, 180 / Math.PI * Math.atan(Math.sinh(n))];
  }
  const metersPerPixel = (lat, z) => EARTH_C * Math.cos(clamp(lat, -MAX_LAT, MAX_LAT) * Math.PI / 180) / (TILE * 2 ** z);
  function haversineM(lng1, lat1, lng2, lat2) {
    const r = d => d * Math.PI / 180, a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
    return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  // Same semantics as backend geofencing.js: boundary counts as inside, holes excluded.
  function onSeg(p, a, b) {
    const cross = (p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0]);
    return Math.abs(cross) <= 1e-12 && p[0] >= Math.min(a[0], b[0]) - 1e-12 && p[0] <= Math.max(a[0], b[0]) + 1e-12 && p[1] >= Math.min(a[1], b[1]) - 1e-12 && p[1] <= Math.max(a[1], b[1]) + 1e-12;
  }
  function inRing(p, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      if (onSeg(p, ring[j], ring[i])) return true;
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function inPolygon(p, g) {
    if (!g || g.type !== 'Polygon' || !Array.isArray(g.coordinates) || !g.coordinates.length) return false;
    if (!inRing(p, g.coordinates[0])) return false;
    for (let i = 1; i < g.coordinates.length; i++) if (inRing(p, g.coordinates[i])) return false;
    return true;
  }
  function tileUrl(tpl, z, x, y) {
    const n = 2 ** z;
    if (y < 0 || y >= n) return null;
    return tpl.replace('{z}', z).replace('{x}', ((x % n) + n) % n).replace('{y}', y);
  }
  function clusterPoints(items, cell) { // items: [{x,y,...}] in screen px
    const buckets = new Map();
    for (const it of items) {
      const k = Math.floor(it.x / cell) + ':' + Math.floor(it.y / cell);
      (buckets.get(k) || buckets.set(k, []).get(k)).push(it);
    }
    return [...buckets.values()].map(m => ({ x: m.reduce((s, i) => s + i.x, 0) / m.length, y: m.reduce((s, i) => s + i.y, 0) / m.length, members: m }));
  }
  const NICE = [0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 30];
  const niceScale = m => { const p = 10 ** Math.floor(Math.log10(m)), f = m / p; return p * (f >= 5 ? 5 : f >= 2 ? 2 : 1); };
  const fmtDist = m => m >= 1000 ? (m / 1000).toFixed(m >= 10000 ? 0 : 1) + ' km' : Math.round(m) + ' m';

  const STATE = { fresh: '#16a34a', stale: '#d97706', old: '#dc2626', invalid: '#6b7280' };
  function freshness(iso, now) {
    const t = Date.parse(iso); if (!Number.isFinite(t)) return 'old';
    const age = now - t; return age < 15 * 60e3 ? 'fresh' : age < 2 * 3600e3 ? 'stale' : 'old';
  }

  function validateMapTileConfig(config = {}) {
    const cfg = { ...config };
    const template = typeof cfg.tileUrl === 'string' ? cfg.tileUrl.trim() : '';
    const validTemplate = template && !template.startsWith('//') && ['{z}', '{x}', '{y}'].every(token => template.includes(token));
    if (!template) {
      cfg.tileUrl = '';
      cfg.externalTilesEnabled = false;
      return cfg;
    }
    // A same-origin relative path is allowed for a buyer-operated tile proxy.
    if (validTemplate && template.startsWith('/') && !template.startsWith('//')) {
      cfg.tileUrl = template;
      cfg.externalTilesEnabled = false;
      return cfg;
    }
    let origin = '';
    try {
      const resolved = new URL(template.replaceAll('{z}', '0').replaceAll('{x}', '0').replaceAll('{y}', '0'));
      if (resolved.protocol === 'https:') origin = resolved.origin;
    } catch {}
    const allowed = Array.isArray(cfg.allowedTileOrigins)
      ? cfg.allowedTileOrigins.filter(value => {
          try { const rawValue = String(value); const u = new URL(rawValue); const expected = rawValue.endsWith('/') ? rawValue.slice(0, -1) : rawValue; return u.protocol === 'https:' && u.origin === expected; }
          catch { return false; }
        })
      : [];
    const approved = Boolean(
      validTemplate &&
      origin &&
      cfg.providerConfigured === true &&
      cfg.licenseAcknowledged === true &&
      typeof cfg.attribution === 'string' &&
      cfg.attribution.trim() &&
      allowed.includes(origin)
    );
    cfg.tileUrl = approved ? template : '';
    cfg.externalTilesEnabled = approved;
    if (!approved) {
      cfg.attribution = '';
      cfg.allowedTileOrigins = [];
      cfg.providerConfigured = false;
      cfg.licenseAcknowledged = false;
    } else {
      cfg.allowedTileOrigins = [origin];
    }
    return cfg;
  }

  class GeoMap {
    constructor(el, opts = {}) {
      const rawCfg = Object.assign({ tileUrl: '', attribution: '', providerConfigured: false, licenseAcknowledged: false, allowedTileOrigins: [], minZoom: 2, maxZoom: 19, defaultCenter: { lng: 0, lat: 20 }, defaultZoom: 2, poorAccuracyM: 100, clusterPx: 34 }, root.OPSCORE_MAP_CONFIG || {}, opts);
      const cfg = validateMapTileConfig(rawCfg);
      this.cfg = cfg; this.el = el;
      this.center = { ...cfg.defaultCenter }; this.zoom = cfg.defaultZoom;
      this.techs = []; this.sites = []; this.fences = []; this.skipped = 0;
      this.tiles = new Map(); this.hits = []; this.raf = 0; this.popup = null;
      el.textContent = ''; el.classList.add('geomap'); el.tabIndex = 0;
      el.setAttribute('role', 'application'); el.setAttribute('aria-label', 'Field map. Arrow keys pan, plus and minus zoom.');
      this.canvas = document.createElement('canvas'); el.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');
      this.pop = document.createElement('div'); this.pop.className = 'geomap-pop hidden'; el.appendChild(this.pop);
      const bar = document.createElement('div'); bar.className = 'geomap-ctl';
      [['+', 'Zoom in', () => this.zoomBy(1)], ['−', 'Zoom out', () => this.zoomBy(-1)], ['⤢', 'Fit all points', () => this.fit()]].forEach(([t, l, f]) => {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.title = l; b.setAttribute('aria-label', l); b.onclick = f; bar.appendChild(b);
      });
      el.appendChild(bar);
      this.note = document.createElement('div'); this.note.className = 'geomap-note'; el.appendChild(this.note);
      this._bind(); this._resize();
      if (root.ResizeObserver) new root.ResizeObserver(() => this._resize()).observe(el); else root.addEventListener('resize', () => this._resize());
    }
    /* ---------- data ---------- */
    setData({ points = [], geofences = [], trails = [] } = {}) {
      const now = Date.now(), techs = [], sites = new Map(); this.skipped = 0;
      this.fences = geofences.filter(g => g.enabled !== 0 && g.enabled !== false && g.geometry && g.geometry.type === 'Polygon');
      // Breadcrumb trails: [{ technicianId, coordinates: [[lng,lat], ...] }]
      this.trails = (Array.isArray(trails) ? trails : []).map(tr => {
        const coords = (tr.coordinates || []).filter(c => Array.isArray(c) && validLL(Number(c[0]), Number(c[1])) && !(Number(c[0]) === 0 && Number(c[1]) === 0));
        return { technicianId: tr.technicianId || null, coordinates: coords };
      }).filter(tr => tr.coordinates.length >= 1);
      for (const p of points) {
        const lng = Number(p.longitude), lat = Number(p.latitude);
        // (0,0) is the classic failed-GPS fix; never plot it as a real position.
        if (!validLL(lng, lat) || (lng === 0 && lat === 0)) { this.skipped++; continue; }
        const acc = p.accuracyMeters == null ? null : Number(p.accuracyMeters);
        const t = { kind: 'tech', lng, lat, acc, p, state: freshness(p.checkedInAt, now), poor: acc == null || !(acc <= this.cfg.poorAccuracyM) };
        t.fences = this.fences.filter(g => inPolygon([lng, lat], g.geometry)).map(g => g.name);
        const sl = Number(p.siteLongitude), sa = Number(p.siteLatitude);
        if (p.siteLongitude != null && p.siteLatitude != null && validLL(sl, sa)) {
          t.site = { lng: sl, lat: sa }; t.distM = haversineM(lng, lat, sl, sa);
          sites.set(sl + ',' + sa, { kind: 'site', lng: sl, lat: sa, name: p.siteName || 'Site' });
        }
        techs.push(t);
      }
      this.techs = techs; this.sites = [...sites.values()];
      this.fit(); this._status();
    }
    _status() {
      const bits = [`${this.techs.length} technician${this.techs.length === 1 ? '' : 's'}`, `${this.fences.length} geofence${this.fences.length === 1 ? '' : 's'}`];
      if (this.trails && this.trails.length) bits.push(`${this.trails.length} trail${this.trails.length === 1 ? '' : 's'}`);
      if (this.skipped) bits.push(`${this.skipped} skipped (invalid coordinates)`);
      const poor = this.techs.filter(t => t.poor).length; if (poor) bits.push(`${poor} low-accuracy fix${poor === 1 ? '' : 'es'}`);
      this.note.textContent = bits.join(' · ') + (this.cfg.tileUrl ? '' : ' · offline basemap (no tile server configured)');
    }
    /* ---------- view ---------- */
    fit() {
      const pts = [...this.techs, ...this.sites];
      for (const g of this.fences) for (const [x, y] of g.geometry.coordinates[0] || []) pts.push({ lng: x, lat: y });
      for (const tr of (this.trails || [])) for (const [x, y] of tr.coordinates) pts.push({ lng: x, lat: y });
      if (!pts.length) { this.center = { ...this.cfg.defaultCenter }; this.zoom = this.cfg.defaultZoom; return this._draw(); }
      let a = 180, b = -180, c = 90, d = -90;
      for (const p of pts) { a = Math.min(a, p.lng); b = Math.max(b, p.lng); c = Math.min(c, p.lat); d = Math.max(d, p.lat); }
      this.center = { lng: (a + b) / 2, lat: (c + d) / 2 };
      const pad = 56, w = Math.max(60, this.w - 2 * pad), h = Math.max(60, this.h - 2 * pad);
      let z = this.cfg.maxZoom - 3;
      for (; z > this.cfg.minZoom; z -= 0.25) { const p1 = project(a, d, z), p2 = project(b, c, z); if (p2[0] - p1[0] <= w && p2[1] - p1[1] <= h) break; }
      this.zoom = clamp(z, this.cfg.minZoom, this.cfg.maxZoom - 3); this._draw();
    }
    zoomBy(dz, at) {
      const z = clamp(this.zoom + dz, this.cfg.minZoom, this.cfg.maxZoom); if (z === this.zoom) return;
      const s = at || { x: this.w / 2, y: this.h / 2 }, g = this._toLL(s.x, s.y);
      this.zoom = z; const q = project(g[0], g[1], z);
      const c = unproject(q[0] - (s.x - this.w / 2), q[1] - (s.y - this.h / 2), z); this.center = { lng: c[0], lat: clamp(c[1], -MAX_LAT, MAX_LAT) }; this._draw();
    }
    _toLL(x, y) { const c = project(this.center.lng, this.center.lat, this.zoom); return unproject(c[0] + x - this.w / 2, c[1] + y - this.h / 2, this.zoom); }
    _toXY(lng, lat) { const c = project(this.center.lng, this.center.lat, this.zoom), p = project(lng, lat, this.zoom); return { x: p[0] - c[0] + this.w / 2, y: p[1] - c[1] + this.h / 2 }; }
    _pan(dx, dy) { const c = project(this.center.lng, this.center.lat, this.zoom), n = unproject(c[0] - dx, c[1] - dy, this.zoom); this.center = { lng: n[0], lat: clamp(n[1], -MAX_LAT, MAX_LAT) }; this._draw(); }
    _resize() {
      const r = this.el.getBoundingClientRect(); this.w = Math.max(200, Math.round(r.width || 600)); this.h = Math.max(200, Math.round(r.height || 420));
      this.dpr = Math.min(3, root.devicePixelRatio || 1); this.canvas.width = this.w * this.dpr; this.canvas.height = this.h * this.dpr;
      this.canvas.style.width = this.w + 'px'; this.canvas.style.height = this.h + 'px'; this._draw();
    }
    /* ---------- input ---------- */
    _bind() {
      const el = this.el, ptrs = new Map(); let moved = 0, pinch = 0;
      const pos = e => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      el.addEventListener('pointerdown', e => { if (e.target.closest('.geomap-ctl,.geomap-pop')) return; el.setPointerCapture?.(e.pointerId); ptrs.set(e.pointerId, pos(e)); moved = 0; pinch = 0; });
      el.addEventListener('pointermove', e => {
        if (!ptrs.has(e.pointerId)) return; const p = pos(e), o = ptrs.get(e.pointerId); ptrs.set(e.pointerId, p);
        if (ptrs.size === 2) {
          const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinch) this.zoomBy(Math.log2(d / pinch), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }); pinch = d; moved = 99;
        } else { moved += Math.abs(p.x - o.x) + Math.abs(p.y - o.y); this._pan(p.x - o.x, p.y - o.y); }
      });
      const up = e => { const was = ptrs.has(e.pointerId), p = pos(e); ptrs.delete(e.pointerId); if (was && moved < 5 && e.type === 'pointerup') this._click(p); pinch = 0; };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      el.addEventListener('wheel', e => { e.preventDefault(); this.zoomBy(-Math.sign(e.deltaY) * (e.ctrlKey ? 0.25 : 0.5), pos(e)); }, { passive: false });
      el.addEventListener('dblclick', e => this.zoomBy(1, pos(e)));
      el.addEventListener('keydown', e => {
        const k = e.key, s = 80;
        if (k === 'ArrowLeft') this._pan(s, 0); else if (k === 'ArrowRight') this._pan(-s, 0); else if (k === 'ArrowUp') this._pan(0, s); else if (k === 'ArrowDown') this._pan(0, -s);
        else if (k === '+' || k === '=') this.zoomBy(1); else if (k === '-') this.zoomBy(-1); else if (k === '0') this.fit(); else if (k === 'Escape') this._closePop(); else return;
        e.preventDefault();
      });
    }
    _click(p) {
      const hit = this.hits.find(h => Math.hypot(h.x - p.x, h.y - p.y) <= h.r + 4);
      if (!hit) return this._closePop();
      if (hit.cluster) { const m = hit.cluster.members; const lo = m.reduce((s, i) => [Math.min(s[0], i.lng), Math.min(s[1], i.lat), Math.max(s[2], i.lng), Math.max(s[3], i.lat)], [180, 90, -180, -90]); this.center = { lng: (lo[0] + lo[2]) / 2, lat: (lo[1] + lo[3]) / 2 }; return this.zoomBy(Math.max(1, Math.min(3, this.cfg.maxZoom - this.zoom))); }
      this._openPop(hit.item, hit.x, hit.y);
    }
    _closePop() { this.pop.classList.add('hidden'); }
    _openPop(it, x, y) {
      const P = this.pop; P.textContent = ''; const line = (t, b) => { const d = document.createElement(b ? 'b' : 'div'); d.textContent = t; P.appendChild(d); if (b) P.appendChild(document.createElement('br')); };
      if (it.kind === 'site') { line(it.name, true); line(`${it.lat.toFixed(6)}, ${it.lng.toFixed(6)}`); }
      else {
        const p = it.p; line(p.technicianEmail || p.technicianId || 'Technician', true);
        line([p.workOrderNumber, p.appointmentStatus].filter(Boolean).join(' · '));
        line(`${it.lat.toFixed(6)}, ${it.lng.toFixed(6)} · ±${it.acc == null ? '—' : Math.round(it.acc)} m${it.poor ? ' (low accuracy)' : ''}`);
        if (p.checkedInAt) line('Check-in: ' + new Date(p.checkedInAt).toLocaleString());
        if (it.distM != null) line(`${fmtDist(it.distM)} straight-line to ${p.siteName || 'site'} (not road ETA)`);
        line(it.fences.length ? 'Inside: ' + it.fences.join(', ') : (this.fences.length ? 'Outside all geofences' : 'No geofences defined'));
      }
      P.classList.remove('hidden'); P.style.left = clamp(x + 12, 4, this.w - 250) + 'px'; P.style.top = clamp(y - 8, 4, this.h - 150) + 'px';
    }
    /* ---------- render ---------- */
    _draw() { if (this.raf) return; this.raf = (root.requestAnimationFrame || (f => setTimeout(f, 16)))(() => { this.raf = 0; this._paint(); }); }
    _tile(z, x, y) {
      const url = tileUrl(this.cfg.tileUrl, z, x, y); if (!url) return null;
      const key = z + '/' + x + '/' + y; let t = this.tiles.get(key);
      if (!t) {
        if (this.tiles.size > 300) this.tiles.delete(this.tiles.keys().next().value);
        const img = new Image(); t = { img, ok: false }; img.crossOrigin = 'anonymous'; img.onload = () => { t.ok = true; this._draw(); }; img.onerror = () => { t.err = true; };
        img.referrerPolicy = 'no-referrer'; img.src = url; this.tiles.set(key, t);
      }
      return t.ok ? t.img : null;
    }
    _paint() {
      const g = this.ctx; if (!g) return; const { w, h } = this; g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.fillStyle = '#e9edf3'; g.fillRect(0, 0, w, h); this._graticule(g); if (this.cfg.tileUrl) this._tiles(g);
      // geofences
      for (const f of this.fences) {
        g.beginPath();
        for (const ring of f.geometry.coordinates) { ring.forEach(([x, y], i) => { const s = this._toXY(x, y); if (i) g.lineTo(s.x, s.y); else g.moveTo(s.x, s.y); }); g.closePath(); }
        g.fillStyle = 'rgba(37,99,235,.12)'; g.fill('evenodd'); g.strokeStyle = 'rgba(37,99,235,.85)'; g.lineWidth = 1.5; g.stroke();
      }
      const mpp = metersPerPixel(this.center.lat, this.zoom); this.hits = [];
      // technician -> site legs
      g.setLineDash([5, 4]); g.strokeStyle = 'rgba(71,85,105,.6)'; g.lineWidth = 1;
      
      // Breadcrumb trails (path history)
      for (const tr of (this.trails || [])) {
        if (tr.coordinates.length < 2) continue;
        g.beginPath();
        tr.coordinates.forEach(([lng, lat], i) => {
          const xy = this._toXY(lng, lat);
          if (i === 0) g.moveTo(xy.x, xy.y); else g.lineTo(xy.x, xy.y);
        });
        g.strokeStyle = 'rgba(37, 99, 235, 0.85)';
        g.lineWidth = 3;
        g.lineJoin = 'round';
        g.lineCap = 'round';
        g.stroke();
        // trail endpoints
        const a = this._toXY(tr.coordinates[0][0], tr.coordinates[0][1]);
        const b = this._toXY(tr.coordinates[tr.coordinates.length - 1][0], tr.coordinates[tr.coordinates.length - 1][1]);
        g.fillStyle = 'rgba(37, 99, 235, 0.95)';
        g.beginPath(); g.arc(a.x, a.y, 4, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(b.x, b.y, 5, 0, Math.PI * 2); g.fill();
      }
for (const t of this.techs) if (t.site) { const a = this._toXY(t.lng, t.lat), b = this._toXY(t.site.lng, t.site.lat); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); if (Math.hypot(a.x - b.x, a.y - b.y) > 70) { g.setLineDash([]); g.fillStyle = '#334155'; g.font = '11px system-ui,sans-serif'; g.fillText(fmtDist(t.distM), (a.x + b.x) / 2 + 4, (a.y + b.y) / 2 - 4); g.setLineDash([5, 4]); } }
      g.setLineDash([]);
      for (const s of this.sites) { const p = this._toXY(s.lng, s.lat); if (p.x < -20 || p.y < -20 || p.x > w + 20 || p.y > h + 20) continue; g.fillStyle = '#0f172a'; g.fillRect(p.x - 6, p.y - 6, 12, 12); g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(p.x - 6, p.y - 6, 12, 12); this.hits.push({ x: p.x, y: p.y, r: 8, item: s }); }
      // accuracy circles (true meters at this latitude), then markers / clusters
      const vis = [];
      for (const t of this.techs) { const p = this._toXY(t.lng, t.lat); if (p.x < -60 || p.y < -60 || p.x > w + 60 || p.y > h + 60) continue; if (t.acc != null && t.acc > 0) { const r = t.acc / mpp; if (r > 3) { g.beginPath(); g.arc(p.x, p.y, Math.min(r, 2000), 0, 6.2832); g.fillStyle = STATE[t.state] + '22'; g.fill(); g.setLineDash(t.poor ? [4, 3] : []); g.strokeStyle = STATE[t.state]; g.lineWidth = 1; g.stroke(); g.setLineDash([]); } } vis.push({ x: p.x, y: p.y, lng: t.lng, lat: t.lat, t }); }
      for (const c of clusterPoints(vis, this.cfg.clusterPx)) {
        if (c.members.length > 1 && this.zoom < this.cfg.maxZoom - 1) {
          g.beginPath(); g.arc(c.x, c.y, 15, 0, 6.2832); g.fillStyle = '#1e293b'; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
          g.fillStyle = '#fff'; g.font = 'bold 12px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(c.members.length), c.x, c.y); g.textAlign = 'start'; g.textBaseline = 'alphabetic';
          this.hits.push({ x: c.x, y: c.y, r: 15, cluster: c, item: null });
        } else for (const m of c.members) {
          const t = m.t; g.beginPath(); g.arc(m.x, m.y, 8, 0, 6.2832); g.fillStyle = t.poor ? '#fff' : STATE[t.state]; g.fill(); g.strokeStyle = STATE[t.state]; g.lineWidth = t.poor ? 3 : 2; g.stroke();
          if (t.poor) { g.beginPath(); g.arc(m.x, m.y, 2.5, 0, 6.2832); g.fillStyle = STATE[t.state]; g.fill(); }
          this.hits.push({ x: m.x, y: m.y, r: 10, item: t });
        }
      }
      this._scale(g, mpp);
      if (this.cfg.attribution) { g.font = '10px system-ui,sans-serif'; g.fillStyle = 'rgba(255,255,255,.8)'; const tw = g.measureText(this.cfg.attribution).width; g.fillRect(w - tw - 10, h - 16, tw + 10, 16); g.fillStyle = '#334155'; g.fillText(this.cfg.attribution, w - tw - 5, h - 5); }
      if (!this.techs.length && !this.sites.length) { g.fillStyle = '#475569'; g.font = '14px system-ui,sans-serif'; g.textAlign = 'center'; g.fillText('No check-in points to plot yet.', w / 2, h / 2); g.textAlign = 'start'; }
    }
    _tiles(g) {
      const z = clamp(Math.round(this.zoom), this.cfg.minZoom, this.cfg.maxZoom), k = 2 ** (this.zoom - z), c = project(this.center.lng, this.center.lat, z);
      const x0 = Math.floor((c[0] - this.w / 2 / k) / TILE), x1 = Math.floor((c[0] + this.w / 2 / k) / TILE), y0 = Math.floor((c[1] - this.h / 2 / k) / TILE), y1 = Math.floor((c[1] + this.h / 2 / k) / TILE);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 80) return;
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) { const img = this._tile(z, tx, ty); if (img) g.drawImage(img, (tx * TILE - c[0]) * k + this.w / 2, (ty * TILE - c[1]) * k + this.h / 2, TILE * k + 0.5, TILE * k + 0.5); }
    }
    _graticule(g) {
      const tl = this._toLL(0, 0), br = this._toLL(this.w, this.h), dpp = 360 / (TILE * 2 ** this.zoom);
      const step = NICE.find(s => s >= 90 * dpp) || 30; g.lineWidth = 1; g.strokeStyle = 'rgba(100,116,139,.28)'; g.fillStyle = '#64748b'; g.font = '10px system-ui,sans-serif';
      for (let lng = Math.ceil(tl[0] / step) * step; lng <= br[0]; lng += step) { const x = this._toXY(lng, this.center.lat).x; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, this.h); g.stroke(); g.fillText(lng.toFixed(step < 0.01 ? 4 : 2) + '°', x + 3, 12); }
      for (let lat = Math.ceil(br[1] / step) * step; lat <= tl[1]; lat += step) { const y = this._toXY(this.center.lng, lat).y; g.beginPath(); g.moveTo(0, y); g.lineTo(this.w, y); g.stroke(); g.fillText(lat.toFixed(step < 0.01 ? 4 : 2) + '°', 4, y - 3); }
    }
    _scale(g, mpp) {
      const m = niceScale(mpp * 110), px = m / mpp, x = 12, y = this.h - 26;
      g.strokeStyle = '#0f172a'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x, y); g.lineTo(x + px, y); g.lineTo(x + px, y - 4); g.stroke();
      g.fillStyle = '#0f172a'; g.font = '11px system-ui,sans-serif'; g.fillText(fmtDist(m), x + 4, y - 7);
    }
  }
  const api = { GeoMap, project, unproject, metersPerPixel, haversineM, inPolygon, tileUrl, validateMapTileConfig, clusterPoints, freshness, fmtDist, validLL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OpsGeo = api;
})(typeof window !== 'undefined' ? window : globalThis);
