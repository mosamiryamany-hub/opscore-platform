import test from 'node:test';
import assert from 'node:assert/strict';
import { isRenderableGeometry, toSpatialFeatureCollection } from '../web/dispatcher-map-geojson.mjs';

test('accepts supported 2D geographic geometry types', () => {
  for (const geometry of [
    { type: 'Point', coordinates: [31.2, 30.0] },
    { type: 'MultiPoint', coordinates: [[31.2, 30.0], [31.3, 30.1]] },
    { type: 'LineString', coordinates: [[31.2, 30.0], [31.3, 30.1]] },
    { type: 'MultiLineString', coordinates: [[[31.2, 30.0], [31.3, 30.1]]] },
    { type: 'Polygon', coordinates: [[[31.2, 30.0], [31.3, 30.0], [31.3, 30.1], [31.2, 30.0]]] },
    { type: 'MultiPolygon', coordinates: [[[[31.2, 30.0], [31.3, 30.0], [31.3, 30.1], [31.2, 30.0]]]] }
  ]) assert.equal(isRenderableGeometry(geometry), true, geometry.type);
});

test('rejects unsupported, malformed, empty, and out-of-range geometries', () => {
  for (const geometry of [
    null,
    { type: 'GeometryCollection', geometries: [] },
    { type: 'Point', coordinates: [181, 0] },
    { type: 'Point', coordinates: [0, 91] },
    { type: 'Point', coordinates: [0, Number.NaN] },
    { type: 'LineString', coordinates: [[0, 0]] },
    { type: 'Polygon', coordinates: [] },
    { type: 'MultiPolygon', coordinates: [] }
  ]) assert.equal(isRenderableGeometry(geometry), false);
});

test('converts only safe allowlisted feature metadata and drops unrenderable rows', () => {
  const collection = toSpatialFeatureCollection([
    {
      id: 'feature-a',
      entityType: 'site',
      featureKey: 'outline',
      geometry: { type: 'Polygon', coordinates: [[[31.2, 30], [31.3, 30], [31.3, 30.1], [31.2, 30]]] },
      properties: { customerEmail: 'private@example.test', tenantId: 'tenant-secret', accessToken: 'never-expose' }
    },
    { id: 'bad-feature', geometry: { type: 'Point', coordinates: [500, 500] } }
  ]);
  assert.equal(collection.type, 'FeatureCollection');
  assert.equal(collection.features.length, 1);
  assert.deepEqual(collection.features[0].properties, {
    featureId: 'feature-a',
    entityType: 'site',
    featureKey: 'outline'
  });
  assert.equal(JSON.stringify(collection).includes('private@example.test'), false);
  assert.equal(JSON.stringify(collection).includes('tenant-secret'), false);
  assert.equal(JSON.stringify(collection).includes('accessToken'), false);
});
