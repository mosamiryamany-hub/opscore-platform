'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveMapTileOrigin } = require('../src/map-tile-security');

test('map CSP accepts only a bare HTTPS origin', () => {
  assert.equal(resolveMapTileOrigin('https://tiles.example.test'), 'https://tiles.example.test');
  assert.equal(resolveMapTileOrigin('https://tiles.example.test/'), 'https://tiles.example.test');
  for (const input of [
    '',
    'http://tiles.example.test',
    'https://tiles.example.test/path',
    'https://tiles.example.test?token=x',
    'https://user:secret@tiles.example.test',
    'data:text/plain,x',
    '//tiles.example.test'
  ]) assert.equal(resolveMapTileOrigin(input), '', input);
});
