'use strict';
/*
 * Buyer-editable map configuration (loaded before geomap.js).
 * Secure default: no commercial provider, API key, or network request is enabled.
 * For a buyer-operated same-origin tile proxy, set tileUrl to
 *   '/tiles/{z}/{x}/{y}.png'.
 *
 * For a licensed external provider, explicitly configure all four:
 *   tileUrl, attribution, providerConfigured: true, licenseAcknowledged: true,
 *   allowedTileOrigins: ['https://exact-provider.example'].
 * The allowedTileOrigins entry must be the exact HTTPS origin (scheme + host + port),
 * and the deployment CSP img-src must separately allow only that origin. Do not put
 * API secrets in this public browser configuration. Prefer a same-origin proxy for
 * providers that require secret keys. Never use public community tile servers for
 * heavy/commercial use unless their published policy explicitly permits it.
 */
window.OPSCORE_MAP_CONFIG = {
  tileUrl: '',
  attribution: '',
  providerConfigured: false,
  licenseAcknowledged: false,
  allowedTileOrigins: [],
  minZoom: 2,
  maxZoom: 19,
  defaultCenter: { lng: 31.2357, lat: 30.0444 },
  defaultZoom: 10,
  poorAccuracyM: 100
};
