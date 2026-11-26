/* OpsCore — landing live layer (v4).
   Keeps the legacy hook ids (#livePill #mStatus #mEngine #mVer #mLat #radar)
   so the previous contract still resolves, but delegates all live work to
   fabric-core.js which measures real same-origin probes. */
(() => {
  'use strict';
  const doc = document;
  const g = id => doc.getElementById(id);

  // Legacy decorative radar, if the element is still present.
  const radar = g('radar');
  if (radar && radar.getContext) {
    const ctx = radar.getContext('2d');
    if (ctx) {
      let a = 0;
      const paint = () => {
        const w = radar.width, h = radar.height, cx = w / 2, cy = h / 2, rad = Math.min(w, h) * 0.45;
        ctx.clearRect(0, 0, w, h);
        for (let i = 1; i <= 4; i++) {
          ctx.beginPath();
          ctx.arc(cx, cy, (rad * i) / 4, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(124,160,255,.12)';
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
        ctx.strokeStyle = 'rgba(77,226,255,.6)';
        ctx.stroke();
        a += 0.02;
        window.requestAnimationFrame(paint);
      };
      paint();
    }
  }

  // Count-up for static KPI numbers, only if they are numeric.
  const nodes = doc.querySelectorAll('[data-count]');
  Array.prototype.forEach.call(nodes, (n, i) => {
    const target = Number(n.getAttribute('data-count'));
    if (!isFinite(target) || target <= 0) return;
    let cur = 0;
    const step = Math.max(1, Math.ceil(target / 26));
    setTimeout(() => {
      const t = setInterval(() => {
        cur += step;
        if (cur >= target) { cur = target; clearInterval(t); }
        n.textContent = String(cur);
      }, 24);
    }, i * 60);
  });

  // Keyboard affordance hint for the palette trigger.
  const trig = doc.querySelector('[data-palette]');
  if (trig && !trig.getAttribute('aria-keyshortcuts')) {
    trig.setAttribute('aria-keyshortcuts', 'Meta+K Control+K');
  }
})();

/* OpsCore v4 — deterministic identity chips (fixes raw object interpolation) */
(function patchIdentityChips(){
  function paint(){
    fetch('/api/verify/release', { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        var commit = d.sourceCommit || d.commit || d.commitSha || d.gitSha || (d.source && d.source.commit) || '';
        var depId  = (d.deployment && (d.deployment.id || d.deployment.uid || d.deployment.name)) || (typeof d.deployment === 'string' ? d.deployment : '');
        var cc = document.getElementById('commitChip');
        var dc = document.getElementById('deployChip');
        if (cc) cc.textContent = commit ? String(commit).slice(0, 12) : '—';
        if (dc) dc.textContent = depId ? String(depId) : '—';
      })
      .catch(function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint);
  else paint();
  window.setTimeout(paint, 1400);
})();
