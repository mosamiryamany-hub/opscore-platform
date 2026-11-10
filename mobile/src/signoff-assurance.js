import * as SecureStore from 'expo-secure-store';
const GATE_KEY = 'opscore.field.local-assurance.v1';
const GATE_VALUE = 'enabled';
export async function requireOsLocalBiometricGate({challengeId,challenge,documentSha256}={}) {
  if(!challengeId || !challenge || !/^[a-f0-9]{64}$/i.test(String(documentSha256||''))) throw new Error('SERVER_SIGNOFF_CHALLENGE_REQUIRED');
  await SecureStore.setItemAsync(GATE_KEY,`${GATE_VALUE}:${challengeId}`,{requireAuthentication:true,keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
  const value=await SecureStore.getItemAsync(GATE_KEY,{requireAuthentication:true});
  if(value!==`${GATE_VALUE}:${challengeId}`) throw new Error('LOCAL_BIOMETRIC_GATE_FAILED');
  return {mode:'os_local_biometric_gate',verifiedAt:new Date().toISOString(),challengeId,challenge,documentSha256};
}
