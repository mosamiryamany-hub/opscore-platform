const crypto = require('node:crypto');
const STRIPE_API_VERSION = '2025-03-31.basil';
const ACTIVE_STATUSES = new Set([
  'active',
  'trialing'
]);
function stripeConfigured() {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}
function verifySignature(rawBody, signature, secret, toleranceSeconds = 300) {
  if (!rawBody || !signature || !secret)
    throw new Error('STRIPE_WEBHOOK_NOT_CONFIGURED');
  const parts = String(signature).split(',').map(x => x.split('='));
  const timestamp = parts.filter(([k]) => k === 't').map(([, v]) => v)[0];
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!timestamp || !/^\d+$/.test(timestamp) || !signatures.length)
    throw new Error('STRIPE_SIGNATURE_INVALID');
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isSafeInteger(Number(timestamp)) || age > toleranceSeconds)
    throw new Error('STRIPE_SIGNATURE_EXPIRED');
  const signed = `${ timestamp }.${ rawBody }`;
  const expected = crypto.createHmac('sha256', secret).update(signed).digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const valid = signatures.some(value => {
    try {
      const got = Buffer.from(value, 'utf8');
      return got.length === expectedBuf.length && crypto.timingSafeEqual(got, expectedBuf);
    } catch {
      return false;
    }
  });
  if (!valid)
    throw new Error('STRIPE_SIGNATURE_INVALID');
  return true;
}
function planFromSubscription(subscription) {
  const metadataPlan = subscription?.metadata?.opscore_plan || subscription?.metadata?.plan;
  if (metadataPlan && /^[A-Za-z0-9_.:-]{1,80}$/.test(String(metadataPlan)))
    return String(metadataPlan);
  const item = subscription?.items?.data?.[0];
  const lookup = item?.price?.lookup_key;
  if (lookup && /^[A-Za-z0-9_.:-]{1,80}$/.test(String(lookup)))
    return String(lookup);
  return null;
}
function limitsFromSubscription(subscription) {
  const raw = subscription?.metadata?.opscore_limits_json;
  if (!raw)
    return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;
    for (const v of Object.values(value))
      if (!Number.isSafeInteger(v) || v < 0)
        return null;
    return value;
  } catch {
    return null;
  }
}
function subscriptionState(subscription, previousPlan = 'free') {
  const status = String(subscription?.status || 'unknown');
  const plan = planFromSubscription(subscription) || previousPlan;
  const limits = limitsFromSubscription(subscription);
  return {
    status,
    active: ACTIVE_STATUSES.has(status),
    plan,
    limits,
    stripeCustomerId: subscription?.customer || null,
    subscriptionId: subscription?.id || null,
    priceId: subscription?.items?.data?.[0]?.price?.id || null,
    currentPeriodEnd: subscription?.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null
  };
}
module.exports = {
  STRIPE_API_VERSION,
  verifySignature,
  stripeConfigured,
  subscriptionState
};
