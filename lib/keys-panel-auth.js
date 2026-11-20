import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'chucky_keys_panel';
const MAX_AGE_SECONDS = 8 * 60 * 60;

export function panelPasswordConfigured() {
  return Boolean(process.env.KEYS_PANEL_PASSWORD?.length >= 16 && process.env.KEYS_ADMIN_SECRET?.length >= 24);
}

function macKey() {
  return createHash('sha256').update(`panel-keys-v1:${process.env.KEYS_PANEL_PASSWORD}:${process.env.KEYS_ADMIN_SECRET}`).digest();
}

function signature(exp) {
  return createHmac('sha256', macKey()).update(`chucky-keys-session:${exp}`).digest('hex');
}

export function validPanelPassword(password) {
  if (!panelPasswordConfigured() || typeof password !== 'string') return false;
  const given = Buffer.from(password);
  const expected = Buffer.from(process.env.KEYS_PANEL_PASSWORD);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function makePanelToken(now = Date.now()) {
  if (!panelPasswordConfigured()) throw new Error('Acceso del panel no configurado');
  const expires = Math.floor(now / 1000) + MAX_AGE_SECONDS;
  return `${expires}.${signature(expires)}`;
}

export function isPanelAuthenticated(req, now = Date.now()) {
  if (!panelPasswordConfigured()) return false;
  // Cookie HttpOnly: JS no puede leer ni almacenar el secreto de panel.
  const cookie = req.cookies?.get?.(COOKIE_NAME)?.value
    || (req.headers.get('cookie') || '').split(';').map(x => x.trim())
      .find(x => x.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  if (!cookie || !/^\d{10}\.[0-9a-f]{64}$/.test(cookie)) return false;
  const [expString, sig] = cookie.split('.');
  const expires = Number(expString);
  const seconds = Math.floor(now / 1000);
  if (!Number.isSafeInteger(expires) || expires <= seconds || expires > seconds + MAX_AGE_SECONDS) return false;
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(signature(expires), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function panelCookieName() { return COOKIE_NAME; }
export function panelMaxAge() { return MAX_AGE_SECONDS; }
