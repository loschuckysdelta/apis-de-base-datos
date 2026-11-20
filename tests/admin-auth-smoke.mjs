import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const envText = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
for (const line of envText.split('\n')) {
  const index = line.indexOf('=');
  if (index <= 0 || line.startsWith('#')) continue;
  process.env[line.slice(0, index)] = line.slice(index + 1);
}
const source = readFileSync(new URL('../lib/admin-auth.js', import.meta.url), 'utf8')
  .replace("import { NextResponse } from 'next/server';", "const NextResponse = { json: (data, options) => ({ data, options, cookies: { set() {} }, headers: { set() {} } }) };");
const { adminConfigured, correctAdminPassword, makeAdminToken, validateAdminToken, adminAuthorized, sameOrigin } =
  await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

const url = 'https://api.example.com/api/users';
function request(method, headers = {}) {
  const h = new Headers(headers);
  return { method, url, headers: h };
}

test('Secrets in local env are valid lengths', () => {
  assert.equal(adminConfigured(), true);
  assert.ok(process.env.API_ACCESS_KEY.length >= 24);
});
test('Correct password only, rejects wrong password', () => {
  assert.equal(correctAdminPassword(process.env.ADMIN_PANEL_PASSWORD), true);
  assert.equal(correctAdminPassword('incorrect'), false);
});
test('Session signature, expiry and forgery checks', () => {
  const now = Date.now();
  const token = makeAdminToken(now);
  assert.ok(validateAdminToken(token, now));
  assert.equal(validateAdminToken(token, now + 9 * 60 * 60 * 1000), false);
  assert.equal(validateAdminToken(token.slice(0, -1) + (token.endsWith('f') ? 'e' : 'f'), now), false);
});
test('No access without cookie or API key', () => {
  assert.equal(adminAuthorized(request('GET')), false);
  assert.equal(adminAuthorized(request('GET', {'x-api-key':'wrong'})), false);
});
test('Valid server-to-server key and HttpOnly cookie are accepted', () => {
  const token = makeAdminToken();
  assert.equal(adminAuthorized(request('GET', {'x-api-key':process.env.API_ACCESS_KEY})), true);
  assert.equal(adminAuthorized(request('GET', {'cookie':'chucky_admin_session=' + token})), true);
});
test('Cross-origin cookie-based writes are denied; valid server-side key works', () => {
  const token = makeAdminToken();
  const forged = {'cookie':'chucky_admin_session=' + token, 'origin':'https://evil.example'};
  assert.equal(sameOrigin(request('POST', forged)), false);
  assert.equal(adminAuthorized(request('POST', forged)), false);
  assert.equal(adminAuthorized(request('POST', {...forged,'x-api-key':process.env.API_ACCESS_KEY})), true);
});
