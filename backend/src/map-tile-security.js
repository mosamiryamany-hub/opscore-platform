'use strict';

function resolveMapTileOrigin(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return '';
    if (url.username || url.password || url.search || url.hash) return '';
    if (url.pathname !== '/' && url.pathname !== '') return '';
    const canonical = url.origin;
    // Accept only a bare origin, optionally with the standard trailing slash.
    if (raw !== canonical && raw !== canonical + '/') return '';
    return canonical;
  } catch {
    return '';
  }
}

module.exports = { resolveMapTileOrigin };
