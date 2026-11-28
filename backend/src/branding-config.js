'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_PATH = path.resolve(__dirname, '..', 'branding.config.json');
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const SAFE_PATH = /^\/[A-Za-z0-9_./-]{1,180}$/;

function optionalHttpsUrl(value, code) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let url;
  try { url = new URL(raw); } catch { throw new Error(code); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error(code);
  return url.toString();
}

function normalizeBranding(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('BRANDING_CONFIG_INVALID');
  const platformName = String(input.platformName || '').trim();
  const tagline = String(input.tagline || '').trim();
  const logoPath = String(input.logoPath || '').trim();
  const primaryColor = String(input.primaryColor || '').trim();
  const supportEmail = String(input.supportEmail || '').trim();
  const welcomeText = String(input.welcomeText || '').trim();
  if (!platformName || platformName.length > 64) throw new Error('BRANDING_PLATFORM_NAME_INVALID');
  if (tagline.length > 120 || welcomeText.length > 240) throw new Error('BRANDING_TEXT_INVALID');
  if (!SAFE_PATH.test(logoPath) || logoPath.startsWith('//') || logoPath.includes('..')) throw new Error('BRANDING_LOGO_PATH_INVALID');
  if (!HEX_COLOR.test(primaryColor)) throw new Error('BRANDING_PRIMARY_COLOR_INVALID');
  if (supportEmail && (supportEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail))) throw new Error('BRANDING_SUPPORT_EMAIL_INVALID');
  return Object.freeze({
    schemaVersion: 'opscore.branding.v1',
    platformName,
    tagline,
    logoPath,
    primaryColor,
    supportEmail,
    supportUrl: optionalHttpsUrl(input.supportUrl, 'BRANDING_SUPPORT_URL_INVALID'),
    welcomeText
  });
}

function loadBranding(filePath = DEFAULT_PATH) {
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { throw new Error('BRANDING_CONFIG_UNREADABLE'); }
  return normalizeBranding(parsed);
}

module.exports = { normalizeBranding, loadBranding };
