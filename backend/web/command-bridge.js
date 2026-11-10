(function () {
  'use strict';
  var rooms = {
    overview: { title: 'Whole-field awareness in one glass wall.', lead: 'Correlate work, motion, risk, evidence and tenant isolation without leaving the bridge.' },
    dispatch: { title: 'Dispatch spine under live pressure.', lead: 'Sequence crews against SLA clocks, travel friction and priority debt before the day fractures.' },
    field: { title: 'Field motion as a living vector field.', lead: 'Track presence, geofence health and check-in integrity as operational weather.' },
    risk: { title: 'Risk & SLA as first-class signal.', lead: 'Surface aging work, breached promises and concentration risk before customers feel the delay.' },
    assurance: { title: 'Assurance chain in plain sight.', lead: 'Evidence seals, audit tips and sign-off state as continuous integrity, not buried logs.' },
    tenancy: { title: 'Tenancy enforced at the data plane.', lead: 'FORCE RLS and NOBYPASSRLS app role — isolation is a runtime property, not a UI filter.' }
  };
  var priorities = [
    { id: 'WO-2041', sev: 'h', text: 'Transformer site · SLA 00:42' },
    { id: 'WO-2033', sev: 'h', text: 'Hospital HVAC · escalation' },
    { id: 'WO-2019', sev: 'm', text: 'Fleet bay 3 · parts wait' },
    { id: 'WO-2008', sev: 'm', text: 'Campus network · revisit' },
    { id: 'WO-1994', sev: 'l', text: 'Routine meter · scheduled' }
  ];
  var intel = [
    { t: 'Concentration', d: 'North sector holds 38% of open high-priority load. Rebalance before 14:00.' },
    { t: 'Evidence lag', d: '3 completed jobs lack sealed evidence > 20 min. Block customer closeout.' },
    { t: 'Tenant posture', d: 'App role NOBYPASSRLS active. Session GUC bind required on authenticated requests.' }
  ];
  var hints = [
    'Pull two techs from low-risk routes into North before SLA cascade.',
    'Freeze non-critical inventory moves until WO-2041 evidence lands.',
    'Keep contact-center handoff queue under 3 to protect field focus.'
  ];
  var events = [
    'dispatch.assign WO-2041 → crew C-12',
    'geofence.enter site S-88 · tech T-09',
    'evidence.seal hash=sha256:9f…c2',
    'sla.timer priority=high remaining=00:41:12',
    'rls.session tenant bound · mode=field',
    'audit.tip advanced · chain intact',
    'contact.queue depth=2',
    'inventory.reserve PX-221 × 2'
  ];
  function $(id) { return document.getElementById(id); }
  var paused = false, eventIdx = 0;

  document.querySelectorAll('.mc-room').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.mc-room').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var conf = rooms[btn.getAttribute('data-room')] || rooms.overview;
      $('mcTitle').textContent = conf.title;
      $('mcLead').textContent = conf.lead;
    });
  });

  $('priorityStack').innerHTML = priorities.map(function (p) {
    var label = p.sev === 'h' ? 'HIGH' : p.sev === 'm' ? 'MED' : 'LOW';
    return '<li><span><b>' + p.id + '</b> · ' + p.text + '</span><span class="sev sev-' + p.sev + '">' + label + '</span></li>';
  }).join('');
  $('intelStrip').innerHTML = intel.map(function (x) {
    return '<div><strong>' + x.t + '</strong>' + x.d + '</div>';
  }).join('');
  $('hints').innerHTML = hints.map(function (h) { return '<div>' + h + '</div>'; }).join('');

  function pushEvent() {
    if (paused) return;
    var line = document.createElement('div');
    line.textContent = '[DEMO · SYNTHETIC] ' + new Date().toLocaleTimeString() + ' · ' + events[eventIdx % events.length];
    $('chronicle').prepend(line);
    while ($('chronicle').children.length > 14) $('chronicle').lastChild.remove();
    eventIdx += 1;
  }
  pushEvent();
  setInterval(pushEvent, 1800);
  $('pauseStream').addEventListener('click', function () {
    paused = !paused;
    this.textContent = paused ? 'Resume' : 'Pause';
  });

  function drawFabric() {
    var canvas = $('fabricCanvas');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height, t = 0;
    function frame() {
      t += 0.025;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(0, 0, w, h);
      var colors = ['rgba(0,229,255,0.85)', 'rgba(139,92,255,0.7)', 'rgba(61,255,154,0.65)'];
      for (var layer = 0; layer < 3; layer++) {
        ctx.beginPath();
        for (var x = 0; x <= w; x += 6) {
          var y = h * (0.35 + layer * 0.15) +
            Math.sin(x * 0.02 + t * (1.2 + layer * 0.3)) * (18 + layer * 8) +
            Math.sin(x * 0.005 + t * 0.7) * 10;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = colors[layer];
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      requestAnimationFrame(frame);
    }
    frame();
  }
  drawFabric();

  function tickClock() { $('mcClock').textContent = new Date().toLocaleTimeString(); }
  tickClock();
  setInterval(tickClock, 1000);

  function loadHealth() {
    var t0 = performance.now();
    fetch('/api/health').then(function (r) { return r.json(); }).then(function (h) {
      var ms = Math.round(performance.now() - t0);
      $('mcHealth').textContent = h.ok ? ('runtime healthy · ' + ms + ' ms') : 'runtime degraded';
      $('kMs').textContent = ms + ' ms';
      $('rSvc').textContent = h.service || '—';
      $('rEng').textContent = String(h.storeEngine || h.database || '—');
      $('rDb').textContent = (h.postgres && h.postgres.database) || h.database || '—';
      $('rWire').textContent = h.postgresRuntimeWired ? 'yes' : 'no';
      $('sigDb').textContent = 'Database · ' + ((h.postgres && h.postgres.connected) ? 'connected' : (h.database || 'unknown'));
      $('sigStore').textContent = 'Store · ' + (h.storeEngine || h.database || '—');
      $('kOpen').textContent = '24';
      $('kField').textContent = '11';
      $('kSla').textContent = '3';
      $('kEv').textContent = '47';
    }).catch(function () { $('mcHealth').textContent = 'health unreachable'; });
  }
  loadHealth();
  setInterval(loadHealth, 15000);

  setInterval(function () {
    function j(id, base, spread) {
      var el = $(id); if (!el) return;
      el.textContent = String(base + Math.floor(Math.random() * (spread + 1)));
    }
    j('kOpen', 22, 6); j('kField', 9, 5); j('kSla', 2, 3); j('kEv', 44, 8);
  }, 5000);
})();
