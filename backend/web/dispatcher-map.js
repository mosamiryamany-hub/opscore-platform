import { toSpatialFeatureCollection } from './dispatcher-map-geojson.mjs';
let maplibregl = null;

const $ = id => document.getElementById(id);
const directionToggle = document.querySelector('[data-dir-toggle]');
if (directionToggle) directionToggle.addEventListener('click', () => {
  const rtl = document.documentElement.getAttribute('dir') !== 'rtl';
  document.documentElement.setAttribute('dir', rtl ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', rtl ? 'ar' : 'en');
  directionToggle.textContent = rtl ? 'EN' : 'ع';
  directionToggle.setAttribute('aria-label', rtl ? 'Switch to English left-to-right layout' : 'Switch to Arabic right-to-left layout');
});
const state = { map: null, sourceReady: false, spatialSourceReady: false, points: [], spatialFeatures: { type: 'FeatureCollection', features: [] }, viewportTimer: null, viewportSequence: 0, viewportRequestCount: 0, lastAppliedViewportSequence: 0 };
const safe = value => String(value ?? '');
const formatDate = value => value ? new Date(value).toLocaleString() : '—';

// Read-only browser acceptance probe. It is inert unless the page is explicitly
// opened with ?e2e=1; it exposes rendered feature IDs and counters, never tenant
// credentials or mutable application state.
if (new URLSearchParams(window.location.search).get('e2e') === '1') {
  window.__opscoreDispatcherMapE2E = Object.freeze({
    renderedSpatialFeatureIds() {
      if (!state.map || !state.spatialSourceReady) return [];
      const layers = ['tenant-spatial-polygons', 'tenant-spatial-lines', 'tenant-spatial-points'];
      return state.map.queryRenderedFeatures(undefined, { layers })
        .filter(feature => feature.source === 'tenant-spatial-features')
        .map(feature => String(feature.id ?? feature.properties?.featureId ?? '')).filter(Boolean).sort();
    },
    projectedPointAt(longitude, latitude) {
      if (!state.map) return null;
      const canvas = state.map.getCanvas();
      const point = state.map.project([Number(longitude), Number(latitude)]);
      return { x: point.x, y: point.y, clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight };
    },
    renderedSpatialFeatureDiagnostics(longitude, latitude) {
      if (!state.map || !state.spatialSourceReady) return null;
      const point = state.map.project([Number(longitude), Number(latitude)]);
      const layers = ['tenant-spatial-polygons', 'tenant-spatial-lines', 'tenant-spatial-points'];
      const all = state.map.queryRenderedFeatures();
      const filtered = state.map.queryRenderedFeatures(undefined, { layers });
      const atPoint = state.map.queryRenderedFeatures(point, { layers });
      const atBox = state.map.queryRenderedFeatures(
        [[point.x - 16, point.y - 16], [point.x + 16, point.y + 16]],
        { layers }
      );
      return {
        point: { x: point.x, y: point.y },
        canvas: { width: state.map.getCanvas().width, height: state.map.getCanvas().height },
        allCount: all.length,
        allSpatial: all.filter(feature => feature.source === 'tenant-spatial-features').map(feature => ({
          id: feature.id ?? null, source: feature.source ?? null, layer: feature.layer?.id ?? null, properties: feature.properties ?? null
        })),
        filteredCount: filtered.length,
        filteredSpatial: filtered.filter(feature => feature.source === 'tenant-spatial-features').map(feature => ({
          id: feature.id ?? null, source: feature.source ?? null, layer: feature.layer?.id ?? null, properties: feature.properties ?? null
        })),
        atPointCount: atPoint.length,
        atBoxCount: atBox.length
      };
    },
    renderedSpatialFeatureIdsAt(longitude, latitude) {
      if (!state.map || !state.spatialSourceReady) return [];
      const point = state.map.project([Number(longitude), Number(latitude)]);
      const geometry = [[point.x - 16, point.y - 16], [point.x + 16, point.y + 16]];
      return state.map.queryRenderedFeatures(geometry, {
        layers: ['tenant-spatial-polygons', 'tenant-spatial-lines', 'tenant-spatial-points']
      }).map(feature => String(feature.id ?? feature.properties?.featureId ?? '')).filter(Boolean).sort();
    },
    viewportSequence() { return state.viewportSequence; },
    viewportRequestCount() { return state.viewportRequestCount; },
    lastAppliedViewportSequence() { return state.lastAppliedViewportSequence; },
    refreshViewportNow() { return refreshSpatialFeatures(); },
    focusTenantFeature(longitude, latitude) {
      if (!state.map || !state.spatialSourceReady) throw new Error('MAP_SOURCE_NOT_READY');
      state.map.jumpTo({ center: [Number(longitude), Number(latitude)], zoom: 12 });
    },
    mapReadiness() {
      return {
        loaded: Boolean(state.map?.loaded()),
        styleLoaded: Boolean(state.map?.isStyleLoaded()),
        sourceLoaded: Boolean(state.map?.isSourceLoaded('tenant-spatial-features')),
        layers: ['tenant-spatial-polygons', 'tenant-spatial-lines', 'tenant-spatial-points'].filter(id => Boolean(state.map?.getLayer(id))),
        center: state.map?.getCenter()?.toArray() || null,
        zoom: state.map?.getZoom() ?? null
      };
    },
    triggerViewportBurst() {
      if (!state.map) throw new Error('MAP_NOT_READY');
      state.map.jumpTo({ center: [31.20, 30.00], zoom: 8 });
      state.map.jumpTo({ center: [31.21, 30.01], zoom: 8 });
      state.map.jumpTo({ center: [31.22, 30.02], zoom: 8 });
    },
    displayedSpatialFeatureIds() {
      return state.spatialFeatures.features.map(feature => String(feature.id ?? feature.properties?.featureId ?? '')).sort();
    }
  });
}

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
    cooperativeGestures: true,
    // Preserve the WebGL drawing buffer only in the isolated browser acceptance
    // context so screenshot-backed geometry assertions inspect rendered pixels.
    // Normal application sessions retain MapLibre's default buffer behavior.
    preserveDrawingBuffer: new URLSearchParams(window.location.search).get('e2e') === '1'
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
    state.map.addSource('tenant-spatial-features', {
      type: 'geojson',
      data: state.spatialFeatures
    });
    state.map.addLayer({
      id: 'tenant-spatial-polygons',
      type: 'fill',
      source: 'tenant-spatial-features',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': '#8b7cff', 'fill-opacity': 0.16 }
    });
    state.map.addLayer({
      id: 'tenant-spatial-lines',
      type: 'line',
      source: 'tenant-spatial-features',
      filter: ['in', ['geometry-type'], 'LineString', 'Polygon'],
      paint: { 'line-color': '#a99cff', 'line-width': 2, 'line-opacity': 0.9 }
    });
    state.map.addLayer({
      id: 'tenant-spatial-points',
      type: 'circle',
      source: 'tenant-spatial-features',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 4, 12, 7, 16, 10],
        'circle-color': '#b69cff',
        'circle-stroke-color': '#17132a',
        'circle-stroke-width': 2
      }
    });
    state.sourceReady = true;
    state.spatialSourceReady = true;
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
    updateMapPoints();
    refreshSpatialFeatures();
  });
  state.map.on('error', event => {
    if (event?.error) message('Map style or tile service is unavailable. Recorded data remains protected; retry or switch the configured style provider.', 'warning');
  });
  state.map.on('moveend', scheduleSpatialRefresh);
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


function currentViewportQuery() {
  if (!state.map) return null;
  const bounds = state.map.getBounds();
  const west = bounds.getWest();
  const south = Math.max(-90, bounds.getSouth());
  const east = bounds.getEast();
  const north = Math.min(90, bounds.getNorth());
  if (![west, south, east, north].every(Number.isFinite) || west < -180 || east > 180 || west >= east || south >= north) return null;
  return new URLSearchParams({
    west: String(west), south: String(south), east: String(east), north: String(north), limit: '1000'
  });
}

async function refreshSpatialFeatures() {
  if (!state.map || !state.spatialSourceReady) return;
  const query = currentViewportQuery();
  if (!query) {
    const countNode = $('spatialFeatureCount');
    if (countNode) countNode.textContent = 'GIS viewport unavailable';
    message('The current map crosses the antimeridian or has no valid geographic viewport; the GIS API does not accept split-envelope requests yet.', 'warning');
    return;
  }
  const sequence = ++state.viewportSequence;
  try {
    state.viewportRequestCount += 1;
    const data = await request('/api/v1/map/viewport?' + query.toString());
    if (sequence !== state.viewportSequence) return;
    state.lastAppliedViewportSequence = sequence;
    state.spatialFeatures = toSpatialFeatureCollection(data.spatialFeatures);
    const source = state.map.getSource('tenant-spatial-features');
    if (source) source.setData(state.spatialFeatures);
    const count = state.spatialFeatures.features.length;
    const countNode = $('spatialFeatureCount');
    if (countNode) countNode.textContent = count + ' authorized GIS features';
    if (data.spatialFeatures === undefined) {
      message('Technician check-ins are loaded. The signed GIS feature layer is not enabled for this deployment.', 'neutral');
    } else {
      message(count
        ? 'Showing tenant-authorized spatial features for the visible map area. Technician check-ins remain recorded appointment events.'
        : 'No tenant-authorized spatial features intersect this map area. No sample geometry is displayed.');
    }
  } catch (error) {
    if (sequence !== state.viewportSequence) return;
    state.spatialFeatures = { type: 'FeatureCollection', features: [] };
    const source = state.map.getSource('tenant-spatial-features');
    if (source) source.setData(state.spatialFeatures);
    const countNode = $('spatialFeatureCount');
    if (countNode) countNode.textContent = 'GIS layer unavailable';
    message(error.status === 401
      ? 'GIS layer requires an authenticated session.'
      : error.status === 403
        ? 'Your role is not authorized to read this GIS viewport.'
        : 'Technician check-ins remain separate; the signed GIS viewport could not be loaded.', 'warning');
  }
}

function scheduleSpatialRefresh() {
  if (state.viewportTimer) clearTimeout(state.viewportTimer);
  state.viewportTimer = setTimeout(() => { refreshSpatialFeatures(); }, 250);
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
      await refreshSpatialFeatures();
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
