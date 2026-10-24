'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');

test('CP-01 | ÉXITO | Inicio de sesión con credenciales válidas (Administrador) | 200, rol ADMINISTRADOR y token CSRF entregado', async () => {
  const { app } = H.crearEntorno();
  const s = await H.comoAdmin(app);
  assert.equal(s.login.body.usuario.rol, 'ADMINISTRADOR');
  assert.ok(s.login.body.csrfToken.length > 20);
});

test('CP-02 | FRACASO | Inicio de sesión con contraseña incorrecta | 401 con mensaje genérico, sin crear sesión', async () => {
  const { app } = H.crearEntorno();
  const r = await H.request(app).post('/api/auth/login').send({ username: 'admin', password: 'incorrecta' });
  assert.equal(r.status, 401);
  assert.equal(r.body.error, 'Usuario o contraseña incorrectos.');
  assert.equal(r.headers['set-cookie'], undefined);
});

test('CP-03 | FRACASO | Inicio de sesión con usuario inexistente | 401 con el mismo mensaje (no revela si el usuario existe)', async () => {
  const { app } = H.crearEntorno();
  const a = await H.request(app).post('/api/auth/login').send({ username: 'fantasma', password: 'Cualquiera#1' });
  const b = await H.request(app).post('/api/auth/login').send({ username: 'admin', password: 'mala' });
  assert.equal(a.status, 401);
  assert.equal(a.body.error, b.body.error);
});

test("CP-04 | FRACASO | Inyección SQL en el campo usuario (' OR '1'='1' --) | 401, el ataque no evade la autenticación", async () => {
  const { app } = H.crearEntorno();
  const r = await H.request(app).post('/api/auth/login').send({ username: "' OR '1'='1' --", password: "' OR '1'='1" });
  assert.equal(r.status, 401);
  assert.equal((await H.request(app).get('/api/auth/me')).status, 401);
});

test('CP-05 | FRACASO | Cinco intentos fallidos consecutivos | La cuenta se bloquea (423) incluso con la contraseña correcta', async () => {
  const { app } = H.crearEntorno();
  for (let i = 0; i < 5; i++) {
    const r = await H.request(app).post('/api/auth/login').send({ username: 'encargado', password: 'mala' });
    assert.equal(r.status, 401);
  }
  const r = await H.request(app).post('/api/auth/login').send({ username: 'encargado', password: 'Encargado#2026' });
  assert.equal(r.status, 423);
});

test('CP-06 | FRACASO | Acceso a una ruta protegida sin sesión | 401 No autenticado', async () => {
  const { app } = H.crearEntorno();
  const r = await H.request(app).get('/api/habitaciones');
  assert.equal(r.status, 401);
});

test('CP-07 | FRACASO | Encargado intenta listar usuarios (escalamiento de privilegios) | 403 Prohibido', async () => {
  const { app } = H.crearEntorno();
  const s = await H.comoEncargado(app);
  assert.equal((await s.get('/api/usuarios')).status, 403);
  assert.equal((await s.get('/api/auditoria')).status, 403);
});

test('CP-08 | FRACASO | Administrador intenta acceder a datos de pasajeros y habitaciones (RNF-08) | 403 Prohibido', async () => {
  const { app } = H.crearEntorno();
  const s = await H.comoAdmin(app);
  assert.equal((await s.get('/api/habitaciones')).status, 403);
  assert.equal((await s.get('/api/historial')).status, 403);
  assert.equal((await s.get('/api/asignaciones/activas')).status, 403);
});

test('CP-09 | FRACASO | Petición de modificación sin token CSRF | 403 y la habitación no se crea', async () => {
  const { app } = H.crearEntorno();
  const s = await H.comoEncargado(app);
  const r = await s.agent.post('/api/habitaciones').send({ numero: '301', tipo: 'SIMPLE', capacidadMaxima: 1, orientacion: 'NORTE' });
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'CSRF');
  assert.equal(await H.estadoHabitacion(s, '301'), undefined);
});

test('CP-10 | ÉXITO | Contraseñas almacenadas con hash bcrypt (RNF-07) | Ninguna contraseña en texto plano en la base de datos', async () => {
  const { db } = H.crearEntorno();
  const filas = db.prepare('SELECT password_hash FROM usuarios').all();
  assert.ok(filas.length >= 2);
  for (const f of filas) {
    assert.match(f.password_hash, /^\$2[aby]\$/);
    assert.ok(!f.password_hash.includes('Admin#2026') && !f.password_hash.includes('Encargado#2026'));
  }
});

test('CP-11 | ÉXITO | Atributos de la cookie de sesión | Cookie HttpOnly y SameSite=Strict', async () => {
  const { app } = H.crearEntorno();
  const r = await H.request(app).post('/api/auth/login').send({ username: 'admin', password: 'Admin#2026' });
  const cookie = r.headers['set-cookie'].join(';');
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
});

test('CP-12 | ÉXITO | Cabeceras de seguridad HTTP (OWASP A05) | CSP presente, nosniff activo y sin X-Powered-By', async () => {
  const { app } = H.crearEntorno();
  const r = await H.request(app).get('/api/auth/me');
  assert.match(r.headers['content-security-policy'], /default-src 'self'/);
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.equal(r.headers['x-powered-by'], undefined);
});

test('CP-13 | ÉXITO | Administrador crea un usuario con rol Encargado (RF-4, CU-02) | 201 y el nuevo usuario puede iniciar sesión', async () => {
  const { app } = H.crearEntorno();
  const a = await H.comoAdmin(app);
  const r = await a.post('/api/usuarios', { username: 'recep.noche', nombreCompleto: 'Camila Vera Díaz', rut: H.rutDe('16543210'), rol: 'ENCARGADO', password: 'Noche#2026' });
  assert.equal(r.status, 201);
  const s = await H.iniciarSesion(app, 'recep.noche', 'Noche#2026');
  assert.equal(s.login.body.usuario.rol, 'ENCARGADO');
});

test('CP-14 | FRACASO | Creación de usuario con contraseña débil | 400 con mensaje de política de contraseñas', async () => {
  const { app } = H.crearEntorno();
  const a = await H.comoAdmin(app);
  const r = await a.post('/api/usuarios', { username: 'debil', nombreCompleto: 'Usuario Débil', rut: H.rutDe('17654321'), rol: 'ENCARGADO', password: 'abc' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /contraseña/i);
});

test('CP-15 | FRACASO | Usuario desactivado por el Administrador | Pierde el acceso de inmediato (sesión activa y nuevo login)', async () => {
  const { app } = H.crearEntorno();
  const a = await H.comoAdmin(app);
  const nuevo = await a.post('/api/usuarios', { username: 'temporal', nombreCompleto: 'Persona Temporal', rut: H.rutDe('18765432'), rol: 'ENCARGADO', password: 'Temporal#2026' });
  const t = await H.iniciarSesion(app, 'temporal', 'Temporal#2026');
  assert.equal((await t.get('/api/habitaciones')).status, 200);
  assert.equal((await a.patch(`/api/usuarios/${nuevo.body.id}/activo`, { activo: false })).status, 200);
  assert.equal((await t.get('/api/habitaciones')).status, 401);
  const r = await H.request(app).post('/api/auth/login').send({ username: 'temporal', password: 'Temporal#2026' });
  assert.equal(r.status, 401);
});

test('CP-16 | ÉXITO | Cierre de sesión | La sesión queda invalidada (401 al consultar el perfil)', async () => {
  const { app } = H.crearEntorno();
  const s = await H.comoEncargado(app);
  assert.equal((await s.get('/api/auth/me')).status, 200);
  assert.equal((await s.post('/api/auth/logout')).status, 200);
  assert.equal((await s.get('/api/auth/me')).status, 401);
});

test("CP-17 | FRACASO | Inyección SQL en la búsqueda de pasajero por RUT | 400, la entrada se rechaza por validación", async () => {
  const { app } = H.crearEntorno();
  const s = await H.comoEncargado(app);
  const r = await s.get("/api/pasajeros?rut=' OR '1'='1");
  assert.equal(r.status, 400);
});

test('CP-18 | FRACASO | Script malicioso (XSS) en el nombre del pasajero | 400, no se registra el pasajero ni se ocupa la habitación', async () => {
  const { app, db } = H.crearEntorno();
  const s = await H.comoEncargado(app);
  const id = await H.idHabitacion(s, '101');
  const r = await s.post('/api/asignaciones', H.payloadAsignacion([{ habitacionId: id, ocupantes: 1 }], {
    pasajero: { nombreCompleto: '<script>alert(1)</script>', rut: H.rutDe('15432167') },
  }));
  assert.equal(r.status, 400);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM pasajeros').get().n, 0);
  assert.equal(await H.estadoHabitacion(s, '101'), 'DISPONIBLE');
});
