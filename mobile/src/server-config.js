import * as SecureStore from 'expo-secure-store';

const KEY = 'opscore.mobile.server-origin.v1';

export function validateServerOrigin(value) {
  let parsed;
  try { parsed = new URL(String(value || '').trim()); }
  catch { throw new Error('API_BASE_URL_INVALID'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
      parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('API_BASE_URL_MUST_BE_HTTPS_ORIGIN_ONLY');
  }
  return parsed.origin;
}

export async function getConfiguredServerOrigin(fallback = '') {
  const saved = await SecureStore.getItemAsync(KEY);
  return validateServerOrigin(saved || fallback);
}

export async function saveServerOrigin(value) {
  const origin = validateServerOrigin(value);
  await SecureStore.setItemAsync(KEY, origin, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  });
  return origin;
}

export async function clearServerOrigin() {
  await SecureStore.deleteItemAsync(KEY);
}

export function parseServerConfigLink(value) {
  let link;
  try { link = new URL(String(value || '')); } catch { return null; }
  if (link.protocol !== 'opscore:' || link.hostname !== 'configure') return null;
  const candidate = link.searchParams.get('server');
  if (!candidate) return null;
  try { return validateServerOrigin(candidate); } catch { return null; }
}
