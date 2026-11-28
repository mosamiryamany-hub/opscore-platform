/* OpsCore Control Rooms — route each domain card to its working surface. */
(() => {
  'use strict';
  const doc = document;
  Array.prototype.forEach.call(doc.querySelectorAll('.room'), card => {
    const key = card.getAttribute('data-room');
    const target = key === 'contact'
      ? '/contact-center-room.html'
      : key === 'twin'
        ? '/digital-twin-room.html'
        : '/control-room.html?room=' + encodeURIComponent(key || '');
    const activate = () => { if (key) window.location.assign(target); };
    card.addEventListener('click', activate);
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate();
      }
    });
  });
  const wall = doc.getElementById('wallToggle');
  const shell = doc.getElementById('roomsShell');
  if (wall && shell) {
    wall.addEventListener('click', () => {
      const enabled = shell.classList.toggle('wall');
      wall.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      wall.textContent = enabled ? 'Exit wall' : 'Wall mode';
    });
  }
})();
