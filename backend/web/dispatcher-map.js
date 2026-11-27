let maplibregl = null;

const $ = id => document.getElementById(id);
const state = { map: null, sourceReady: false, points: [] };
const safe = value => String(value ?? '');
const formatDate = value => value ? new Date(value).toLocaleString() : '—';

async function request(path) {
  const response = await fetch(path, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { accept: 'application/json' }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error?.code || 'REQUEST_FAILED');
    error.status = response.status;
    throw error;
  }
  return payload;
}

function message(text, tone = 'neutral') {
  const node = $('mapMessage');
  node.textContent = text;
  node.dataset.tone = tone;
}

function validPoint(point) {
  const lat = Number(point.latitude), lon = Number(point.longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function pointFeature(point) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [Number(point.longitude), Number(point.latitude)] },
    properties: {
      technicianId: safe(point.technicianId),
      technicianEmail: safe(point.technicianEmail),
      workOrderNumber: safe(point.workOrderNumber),
      workOrderTitle: safe(point.workOrderTitle),
      appointmentStatus: safe(point.appointmentStatus),
      checkedInAt: safe(point.checkedInAt),
      accuracyMeters: point.accuracyMeters == null ? null : Number(point.accuracyMeters)
    }
  };
}

function createPopup(feature) {
  const root = document.createElement('section');
  root.className = 'dispatcher-popup';
  const title = document.createElement('strong');
  title.textContent = feature.properties.technicianEmail || feature.properties.technicianId || 'Technician';
  const work = document.createElement('p');
  work.textContent = [feature.properties.workOrderNumber, feature.properties.workOrderTitle].filter(Boolean).join(' · ') || 'No work-order label';
  const status = document.createElement('p');
  status.textContent = 'Appointment: ' + (feature.properties.appointmentStatus || 'unknown');
  const checked = document.createElement('p');
  checked.textContent = 'Recorded: ' + formatDate(feature.properties.checkedInAt);
  root.append(title, work, status, checked);
  return root;
}

function renderList(points) {
  const list = $('pointList');
  list.replaceChildren();
  $('pointCount').textContent = String(points.length);
  if (!points.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No persisted technician check-in coordinates are available for this organization.';
    list.append(empty);
    return;
  }
  for (const point of points) {
    const row = document.createElement('article');
    row.className = 'point-row';
    const info = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'point-name';
    name.textContent = point.technicianEmail || point.technicianId || 'Technician';
    const meta = document.createElement('div');
    meta.className = 'point-meta';
    meta.textContent = [point.workOrderNumber, point.appointmentStatus, formatDate(point.checkedInAt)].filter(Boolean).join(' · ');
    info.append(name, meta);
    const button = document.createElement('button');
    button.className = 'point-open';
    button.type = 'button';
    button.textContent = 'Locate';
    button.addEventListener('click', () => {
      if (state.map) state.map.flyTo({ center: [Number(point.longitude), Number(point.latitude)], zoom: 14, essential: true });
    });
    row.append(info, button);
    list.append(row);
  }
}

async function ensureMap() {
  if (state.map) return;
  if (!maplibregl) maplibregl = await import('https://unpkg.com/maplibre-gl@6.20.0/dist/maplibre-gl.mjs');
  const container = $('dispatcherMap');
  state.map = new maplibregl.Map({
    container,
    style: container.dataset.styleUrl,
    center: [0, 0],
    zoom: 1.2,
    attributionControl: true,
    cooperativeGestures: true
  });
  state.map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
  state.map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');
  state.map.on('load', () => {
    state.map.addSource('technician-checkins', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });
    state.map.addLayer({
      id: 'technician-checkins',
      type: 'circle',
      source: 'technician-checkins',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 5, 12, 9, 16, 12],
        'circle-color': '#4de2ff',
        'circle-stroke-color': '#07111f',
        'circle-stroke-width': 2,
        'circle-opacity': 0.92
      }
    });
    state.sourceReady = true;
    updateMapPoints();
  });
  state.map.on('click', 'technician-checkins', event => {
    const feature = event.features?.[0];
    if (!feature) return;
    new maplibregl.Popup({ closeButton: true, closeOnClick: true })
      .setLngLat(feature.geometry.coordinates)
      .setDOMContent(createPopup(feature))
      .addTo(state.map);
  });
  state.map.on('mouseenter', 'technician-checkins', () => { state.map.getCanvas().style.cursor = 'pointer'; });
  state.map.on('mouseleave', 'technician-checkins', () => { state.map.getCanvas().style.cursor = ''; });
  state.map.on('error', event => {
    if (event?.error) message('Map style or tile service is unavailable. Recorded data remains protected; retry or switch the configured style provider.', 'warning');
  });
}

function updateMapPoints() {
  if (!state.sourceReady || !state.map) return;
  const source = state.map.getSource('technician-checkins');
  source.setData({ type: 'FeatureCollection', features: state.points.map(pointFeature) });
  if (state.points.length) {
    const bounds = new maplibregl.LngLatBounds();
    state.points.forEach(point => bounds.extend([Number(point.longitude), Number(point.latitude)]));
    state.map.fitBounds(bounds, { padding: 72, maxZoom: 13, duration: 500 });
  }
}

async function refresh() {
  $('refreshMap').disabled = true;
  $('dataState').textContent = 'Refreshing';
  message('Checking authenticated session and requesting tenant-scoped check-in records…');
  try {
    await request('/api/v1/me');
    $('authState').textContent = 'Authenticated session';
    const data = await request('/api/v1/dispatcher-map/v2');
    state.points = (Array.isArray(data.points) ? data.points : []).filter(validPoint);
    renderList(state.points);
    $('dataState').textContent = state.points.length + ' recorded positions';
    try {
      await ensureMap();
      updateMapPoints();
      message(state.points.length
        ? 'Showing latest persisted appointment check-in per technician. Positions update only when refreshed.'
        : 'No stored check-in points. No location pins were fabricated.');
    } catch (_) {
      message('Map renderer or tile provider is unavailable. The authenticated record list remains available; no substitute map or pins are shown.', 'warning');
    }
  } catch (error) {
    state.points = [];
    renderList([]);
    $('authState').textContent = error.status === 401 ? 'Sign-in required' : error.status === 403 ? 'Role not authorized' : 'Access unavailable';
    $('dataState').textContent = 'No data';
    message(error.status === 401
      ? 'Sign in through the OpsCore Control Plane, then return to this page.'
      : error.status === 403
        ? 'Your current role is not authorized to view technician check-in coordinates.'
        : 'The authenticated map data could not be loaded. No local or sample records are displayed.', 'warning');
  } finally {
    $('refreshMap').disabled = false;
  }
}

$('refreshMap').addEventListener('click', refresh);
refresh();
