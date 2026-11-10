'use strict';
/**
 * Buyer-environment notification adapters (REQ-01).
 *
 * Design rules (same honesty as Stripe):
 * - No free hosted Email/SMS/WhatsApp from this package.
 * - Buyer supplies provider credentials via env or per-tenant config.
 * - Missing credentials → fail-closed with explicit error codes (no silent fake send).
 * - Adapters only perform HTTPS calls to well-known provider APIs; they do not invent delivery.
 *
 * Supported channel keys: email | sms | whatsapp
 * Provider keys (env, optional overrides in DB config JSON):
 *   OPSC_NOTIFY_EMAIL_PROVIDER=sendgrid|mailgun|none
 *   OPSC_NOTIFY_EMAIL_API_KEY=...
 *   OPSC_NOTIFY_EMAIL_FROM=...
 *   OPSC_NOTIFY_SMS_PROVIDER=twilio|none
 *   OPSC_NOTIFY_SMS_ACCOUNT_SID=...
 *   OPSC_NOTIFY_SMS_AUTH_TOKEN=...
 *   OPSC_NOTIFY_SMS_FROM=...
 *   OPSC_NOTIFY_WHATSAPP_PROVIDER=twilio|none
 *   OPSC_NOTIFY_WHATSAPP_FROM=whatsapp:+E.164
 */

const https = require('node:https');
const { URL } = require('node:url');

function env(name, fallback = '') {
  const v = process.env[name];
  return v == null || String(v).trim() === '' ? fallback : String(v).trim();
}

function postJson(urlString, headers, body, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(urlString);
    } catch {
      return reject(Object.assign(new Error('NOTIFY_URL_INVALID'), { code: 'NOTIFY_URL_INVALID' }));
    }
    if (u.protocol !== 'https:') {
      return reject(Object.assign(new Error('NOTIFY_HTTPS_REQUIRED'), { code: 'NOTIFY_HTTPS_REQUIRED' }));
    }
    const payload = Buffer.from(JSON.stringify(body), 'utf8');
    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': payload.length,
          ...headers
        },
        timeout: timeoutMs
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ statusCode: res.statusCode || 0, body: text });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      reject(Object.assign(new Error('NOTIFY_TIMEOUT'), { code: 'NOTIFY_TIMEOUT' }));
    });
    req.on('error', (e) => reject(Object.assign(e, { code: e.code || 'NOTIFY_NETWORK_ERROR' })));
    req.write(payload);
    req.end();
  });
}

function postFormBasic(urlString, username, password, form, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(urlString);
    } catch {
      return reject(Object.assign(new Error('NOTIFY_URL_INVALID'), { code: 'NOTIFY_URL_INVALID' }));
    }
    if (u.protocol !== 'https:') {
      return reject(Object.assign(new Error('NOTIFY_HTTPS_REQUIRED'), { code: 'NOTIFY_HTTPS_REQUIRED' }));
    }
    const body = new URLSearchParams(form).toString();
    const auth = Buffer.from(`${username}:${password}`).toString('base64');
    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'content-length': Buffer.byteLength(body),
          authorization: `Basic ${auth}`
        },
        timeout: timeoutMs
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({ statusCode: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      reject(Object.assign(new Error('NOTIFY_TIMEOUT'), { code: 'NOTIFY_TIMEOUT' }));
    });
    req.on('error', (e) => reject(Object.assign(e, { code: e.code || 'NOTIFY_NETWORK_ERROR' })));
    req.write(body);
    req.end();
  });
}

async function sendEmail({ to, subject, text, html }, cfg = {}) {
  const provider = (cfg.provider || env('OPSC_NOTIFY_EMAIL_PROVIDER', 'none')).toLowerCase();
  if (provider === 'none' || provider === '') {
    const err = new Error('EMAIL_PROVIDER_NOT_CONFIGURED');
    err.code = 'EMAIL_PROVIDER_NOT_CONFIGURED';
    throw err;
  }
  const apiKey = cfg.apiKey || env('OPSC_NOTIFY_EMAIL_API_KEY');
  const from = cfg.from || env('OPSC_NOTIFY_EMAIL_FROM');
  if (!apiKey || !from) {
    const err = new Error('EMAIL_PROVIDER_CREDENTIALS_MISSING');
    err.code = 'EMAIL_PROVIDER_CREDENTIALS_MISSING';
    throw err;
  }
  if (provider === 'sendgrid') {
    const r = await postJson(
      'https://api.sendgrid.com/v3/mail/send',
      { authorization: `Bearer ${apiKey}` },
      {
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from },
        subject: subject || '(no subject)',
        content: [{ type: 'text/plain', value: text || '' }].concat(
          html ? [{ type: 'text/html', value: html }] : []
        )
      }
    );
    if (r.statusCode >= 200 && r.statusCode < 300) {
      return { provider: 'sendgrid', status: 'accepted', statusCode: r.statusCode };
    }
    const err = new Error(`EMAIL_PROVIDER_REJECTED:${r.statusCode}`);
    err.code = 'EMAIL_PROVIDER_REJECTED';
    err.details = { statusCode: r.statusCode, body: r.body.slice(0, 500) };
    throw err;
  }
  if (provider === 'mailgun') {
    const domain = cfg.domain || env('OPSC_NOTIFY_EMAIL_MAILGUN_DOMAIN');
    if (!domain) {
      const err = new Error('EMAIL_PROVIDER_CREDENTIALS_MISSING');
      err.code = 'EMAIL_PROVIDER_CREDENTIALS_MISSING';
      throw err;
    }
    const r = await postFormBasic(
      `https://api.mailgun.net/v3/${domain}/messages`,
      'api',
      apiKey,
      { from, to, subject: subject || '(no subject)', text: text || '' }
    );
    if (r.statusCode >= 200 && r.statusCode < 300) {
      return { provider: 'mailgun', status: 'accepted', statusCode: r.statusCode };
    }
    const err = new Error(`EMAIL_PROVIDER_REJECTED:${r.statusCode}`);
    err.code = 'EMAIL_PROVIDER_REJECTED';
    throw err;
  }
  const err = new Error(`EMAIL_PROVIDER_UNSUPPORTED:${provider}`);
  err.code = 'EMAIL_PROVIDER_UNSUPPORTED';
  throw err;
}

async function sendSms({ to, body }, cfg = {}) {
  const provider = (cfg.provider || env('OPSC_NOTIFY_SMS_PROVIDER', 'none')).toLowerCase();
  if (provider === 'none' || provider === '') {
    const err = new Error('SMS_PROVIDER_NOT_CONFIGURED');
    err.code = 'SMS_PROVIDER_NOT_CONFIGURED';
    throw err;
  }
  if (provider !== 'twilio') {
    const err = new Error(`SMS_PROVIDER_UNSUPPORTED:${provider}`);
    err.code = 'SMS_PROVIDER_UNSUPPORTED';
    throw err;
  }
  const sid = cfg.accountSid || env('OPSC_NOTIFY_SMS_ACCOUNT_SID');
  const token = cfg.authToken || env('OPSC_NOTIFY_SMS_AUTH_TOKEN');
  const from = cfg.from || env('OPSC_NOTIFY_SMS_FROM');
  if (!sid || !token || !from) {
    const err = new Error('SMS_PROVIDER_CREDENTIALS_MISSING');
    err.code = 'SMS_PROVIDER_CREDENTIALS_MISSING';
    throw err;
  }
  const r = await postFormBasic(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    sid,
    token,
    { To: to, From: from, Body: body || '' }
  );
  if (r.statusCode >= 200 && r.statusCode < 300) {
    return { provider: 'twilio', status: 'accepted', statusCode: r.statusCode };
  }
  const err = new Error(`SMS_PROVIDER_REJECTED:${r.statusCode}`);
  err.code = 'SMS_PROVIDER_REJECTED';
  throw err;
}

async function sendWhatsApp({ to, body }, cfg = {}) {
  const provider = (cfg.provider || env('OPSC_NOTIFY_WHATSAPP_PROVIDER', 'none')).toLowerCase();
  if (provider === 'none' || provider === '') {
    const err = new Error('WHATSAPP_PROVIDER_NOT_CONFIGURED');
    err.code = 'WHATSAPP_PROVIDER_NOT_CONFIGURED';
    throw err;
  }
  if (provider !== 'twilio') {
    const err = new Error(`WHATSAPP_PROVIDER_UNSUPPORTED:${provider}`);
    err.code = 'WHATSAPP_PROVIDER_UNSUPPORTED';
    throw err;
  }
  const sid = cfg.accountSid || env('OPSC_NOTIFY_SMS_ACCOUNT_SID') || env('OPSC_NOTIFY_WHATSAPP_ACCOUNT_SID');
  const token = cfg.authToken || env('OPSC_NOTIFY_SMS_AUTH_TOKEN') || env('OPSC_NOTIFY_WHATSAPP_AUTH_TOKEN');
  const from = cfg.from || env('OPSC_NOTIFY_WHATSAPP_FROM');
  if (!sid || !token || !from) {
    const err = new Error('WHATSAPP_PROVIDER_CREDENTIALS_MISSING');
    err.code = 'WHATSAPP_PROVIDER_CREDENTIALS_MISSING';
    throw err;
  }
  const toAddr = String(to).startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  const fromAddr = String(from).startsWith('whatsapp:') ? from : `whatsapp:${from}`;
  const r = await postFormBasic(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    sid,
    token,
    { To: toAddr, From: fromAddr, Body: body || '' }
  );
  if (r.statusCode >= 200 && r.statusCode < 300) {
    return { provider: 'twilio', status: 'accepted', statusCode: r.statusCode, channel: 'whatsapp' };
  }
  const err = new Error(`WHATSAPP_PROVIDER_REJECTED:${r.statusCode}`);
  err.code = 'WHATSAPP_PROVIDER_REJECTED';
  throw err;
}

function providerStatus() {
  return {
    schemaVersion: 'opscore.notification-adapters.v1',
    email: {
      provider: env('OPSC_NOTIFY_EMAIL_PROVIDER', 'none'),
      configured: Boolean(env('OPSC_NOTIFY_EMAIL_API_KEY') && env('OPSC_NOTIFY_EMAIL_FROM'))
    },
    sms: {
      provider: env('OPSC_NOTIFY_SMS_PROVIDER', 'none'),
      configured: Boolean(
        env('OPSC_NOTIFY_SMS_ACCOUNT_SID') && env('OPSC_NOTIFY_SMS_AUTH_TOKEN') && env('OPSC_NOTIFY_SMS_FROM')
      )
    },
    whatsapp: {
      provider: env('OPSC_NOTIFY_WHATSAPP_PROVIDER', 'none'),
      configured: Boolean(
        (env('OPSC_NOTIFY_SMS_ACCOUNT_SID') || env('OPSC_NOTIFY_WHATSAPP_ACCOUNT_SID')) &&
          (env('OPSC_NOTIFY_SMS_AUTH_TOKEN') || env('OPSC_NOTIFY_WHATSAPP_AUTH_TOKEN')) &&
          env('OPSC_NOTIFY_WHATSAPP_FROM')
      )
    },
    note: 'Buyer-environment dependency. No delivery is claimed until credentials are present and provider accepts the message.'
  };
}

module.exports = {
  sendEmail,
  sendSms,
  sendWhatsApp,
  providerStatus
};
