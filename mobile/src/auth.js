import * as SecureStore from 'expo-secure-store';
import { setLocalScope } from './db';

const KEY = 'opscore.mobile.auth.v1';

function normalizeAuth(value) {
  const token = typeof value?.token === 'string' ? value.token : '';
  const userId = String(value?.userId || value?.user?.id || '').trim();
  const organizationId = String(value?.organizationId || value?.organization?.id || '').trim();
  if (!token || !userId || !organizationId) throw new Error('MOBILE_AUTH_RESPONSE_INVALID');
  return { ...value, token, userId, organizationId };
}

export async function saveAuth(value) {
  const normalized = normalizeAuth(value);
  await SecureStore.setItemAsync(KEY, JSON.stringify(normalized), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  });
  return normalized;
}

export async function loadAuth() {
  try {
    const value = await SecureStore.getItemAsync(KEY);
    if (!value) return null;
    const normalized = normalizeAuth(JSON.parse(value));
    // Upgrade records written by versions that stored the nested server response only.
    if (value !== JSON.stringify(normalized)) {
      await SecureStore.setItemAsync(KEY, JSON.stringify(normalized), {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
      });
    }
    return normalized;
  } catch {
    await clearAuth();
    return null;
  }
}

export async function clearAuth() {
  let cleared = true;
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    cleared = false;
  } finally {
    // Keep encrypted user-scoped offline actions for a later sign-in. Clearing all tenants'
    // rows here silently destroyed unsynchronized field actions and captured evidence.
    setLocalScope('anonymous');
  }
  return cleared;
}
