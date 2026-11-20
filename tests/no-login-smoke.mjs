import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
test('panel does not require a login', () => {
 assert.doesNotMatch(read('public/script.js'), /\/api\/admin\/session|login\.html|logoutAdmin/);
 assert.doesNotMatch(read('public/index.html'), /logoutAdmin|password/);
 assert.match(read('app/page.js'), /redirect\('\/index\.html'\)/);
});
test('history needs no session', () => {
 assert.doesNotMatch(read('app/api/keys/listar/route.js'), /adminAuthorized|isPanelAuthenticated|unauthorized/);
 assert.doesNotMatch(read('public/keys-historial.html'), /keys-acceso\.html|login\.html|\bid="salir"/);
});
test('admin API endpoints do not check password or sessions', () => {
 for (const group of ['users','contactos','baneados','vip','stats','health']) {
   const route = read(`app/api/${group}/route.js`);
   assert.doesNotMatch(route, /adminAuthorized|unauthorized|ADMIN_PANEL_PASSWORD/);
 }
 assert.doesNotMatch(read('app/api/verificar/registros/route.js'), /adminAuthorized|isAdminAuthorized/);
});
test('only MongoDB connection variables required', () => {
 const env=read('.env.example');
 assert.match(env,/MONGODB_URI=/);
 assert.match(env,/MONGODB_DB=/);
 assert.doesNotMatch(env,/(?:ADMIN_|PANEL_PASSWORD|API_ACCESS_KEY|KEYS_ADMIN_SECRET|VERIFICAR_ADMIN_SECRET)/);
 assert.equal(fs.existsSync(path.join(root,'public/login.html')),false);
});
