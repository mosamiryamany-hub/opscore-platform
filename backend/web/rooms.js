/* OpsCore Control Rooms — interaction layer (v4).
   Progressive: the grid is fully readable without JS; this only adds the drawer. */
(() => {
  'use strict';
  const doc = document;

  const META = {
    dispatch: {
      code: 'room-01 · dispatch',
      governs: 'Work-order assignment and technician matching',
      endpoints: '/api/v1/work-orders · /api/v1/operational-jobs',
      holds: 'Conflict detection prevents two overlapping jobs on one technician; SLA clocks are derived, never hand-entered.',
      not: 'Does not dispatch outside the tenant boundary and does not synthesise availability.'
    },
    assurance: {
      code: 'room-02 · assurance',
      governs: 'Evidence capture, acceptance gates, predictive asset health',
      endpoints: '/api/v1/evidence · /api/v1/assets',
      holds: 'Evidence uploads are content-addressed and bound to the job they prove.',
      not: 'Does not certify asset health without a completed inspection record.'
    },
    inventory: {
      code: 'room-03 · inventory',
      governs: 'Stock, reservations, part consumption',
      endpoints: '/api/v1/inventory · /api/v1/assets',
      holds: 'Consumption is posted against the work order that moved the part.',
      not: 'Does not reconcile supplier invoices; that is the billing room.'
    },
    field: {
      code: 'room-04 · field',
      governs: 'Field presence, routing, offline completion',
      endpoints: '/api/v1/field · /api/v1/dispatch-candidates',
      holds: 'Offline completions replay idempotently through the outbox.',
      not: 'Does not guarantee coverage in regions without a licensed map provider — that is an external dependency.'
    },
    incident: {
      code: 'room-05 · incident',
      governs: 'Safe mode, anomaly triage, audit chain',
      endpoints: '/api/v1/control-plane · /api/v1/control-plane/safe-mode',
      holds: 'Every safe-mode transition writes an immutable audit entry with actor and reason.',
      not: 'Does not auto-remediate; the platform surfaces state, humans decide.'
    },
    tenant: {
      code: 'room-06 · tenant',
      governs: 'Row-level security, cross-tenant denial, runtime privilege',
      endpoints: '/api/verify/database-security',
      holds: 'Runtime role holds no BYPASSRLS and no superuser attribute.',
      not: 'Catalog coverage is not behavioural certification; read the proof page for the exact verdict scope.'
    },
    billing: {
      code: 'room-07 · billing',
      governs: 'Invoices, plan limits, usage counters',
      endpoints: '/api/v1/billing',
      holds: 'Counters are recomputed from the job ledger, not incremented blindly.',
      not: 'Does not process card payments in this deployment.'
    },
    release: {
      code: 'room-08 · release',
      governs: 'Commit identity, gate verdicts, proof endpoints',
      endpoints: '/api/verify/release · /api/verify/deployment',
      holds: 'The served commit must equal the committed source for a proof to read PASS.',
      not: 'A green pipeline is not an isolation certificate; the two are reported separately.'
    }
  };

  const drawer = doc.getElementById('roomDrawer');
  const title = doc.getElementById('roomTitle');
  const code = doc.getElementById('roomCode');
  const body = doc.getElementById('roomBody');
  const meta = doc.getElementById('roomMeta');
  const go = doc.getElementById('roomGo');
  const closeBtn = doc.getElementById('roomDrawerClose');
  const grid = doc.getElementById('roomGrid');

  function open(key, name) {
    const m = META[key];
    if (!m || !drawer) return;
    title.textContent = name;
    code.textContent = m.code;
    body.textContent = m.holds + ' ' + m.not;
    meta.innerHTML = '';
    [['Governs', m.governs], ['Endpoints', m.endpoints]].forEach(([k, v]) => {
      const dt = doc.createElement('dt'); dt.textContent = k;
      const dd = doc.createElement('dd'); dd.textContent = v;
      meta.appendChild(dt); meta.appendChild(dd);
    });
    go.href = '/control-plane.html';
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    if (closeBtn) closeBtn.focus();
  }
  function close() {
    if (!drawer) return;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
  }

  // Each card opens a domain brief. No synthetic load/risk values are rendered.
  Array.prototype.forEach.call(doc.querySelectorAll('.room'), card => {
    const name = card.querySelector('.room__name');
    const key = card.getAttribute('data-room');
    const fire = () => open(key, name ? name.textContent.trim() : key);
    card.addEventListener('click', fire);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); }
    });
  });

  if (closeBtn) closeBtn.addEventListener('click', close);
  if (drawer) drawer.addEventListener('click', e => { if (e.target === drawer) close(); });
  doc.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  // wall mode
  const wall = doc.getElementById('wallToggle');
  const shell = doc.getElementById('roomsShell');
  if (wall && shell) {
    wall.addEventListener('click', () => {
      const on = shell.classList.toggle('wall');
      wall.setAttribute('aria-pressed', on ? 'true' : 'false');
      wall.textContent = on ? 'Exit wall' : 'Wall mode';
    });
  }
})();
