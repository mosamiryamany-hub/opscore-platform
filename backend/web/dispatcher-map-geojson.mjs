const ALLOWED_GEOMETRIES = new Set([
  'Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'
]);

function validPosition(position) {
  return Array.isArray(position)
    && position.length === 2
    && typeof position[0] === 'number'
    && typeof position[1] === 'number'
    && Number.isFinite(position[0])
    && Number.isFinite(position[1])
    && position[0] >= -180 && position[0] <= 180
    && position[1] >= -90 && position[1] <= 90;
}

function validLine(line) {
  return Array.isArray(line) && line.length >= 2 && line.every(validPosition);
}

function validPolygon(polygon) {
  return Array.isArray(polygon) && polygon.length > 0 && polygon.every(validLine);
}

export function isRenderableGeometry(geometry) {
  if (!geometry || typeof geometry !== 'object' || !ALLOWED_GEOMETRIES.has(geometry.type)) return false;
  const c = geometry.coordinates;
  switch (geometry.type) {
    case 'Point': return validPosition(c);
    case 'MultiPoint': return Array.isArray(c) && c.length > 0 && c.every(validPosition);
    case 'LineString': return validLine(c);
    case 'MultiLineString': return Array.isArray(c) && c.length > 0 && c.every(validLine);
    case 'Polygon': return validPolygon(c);
    case 'MultiPolygon': return Array.isArray(c) && c.length > 0 && c.every(validPolygon);
    default: return false;
  }
}

export function toSpatialFeatureCollection(rows) {
  const features = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || !isRenderableGeometry(row.geometry)) continue;
    const properties = {
      featureId: typeof row.id === 'string' ? row.id.slice(0, 160) : '',
      entityType: typeof row.entityType === 'string' ? row.entityType.slice(0, 80) : '',
      featureKey: typeof row.featureKey === 'string' ? row.featureKey.slice(0, 120) : ''
    };
    features.push({
      type: 'Feature',
      id: properties.featureId || undefined,
      geometry: row.geometry,
      properties
    });
  }
  return { type: 'FeatureCollection', features };
}
