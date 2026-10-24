'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');

async function preparar(deps) {
  const { app, db } = H.crearEntorno(deps);
  const s = await H.comoEncargado(app);
  return { app, db, s, id: (n) => H.idHabitacion(s, n) };
}

test('CP-44 | ÉXITO | Costo según la cantidad de noches (1 pasajero, 3 noches) | 201, noches = 3 y costo total $120.000', async () => {
  const { s, id } = await preparar();
  const r = await s.post('/api/asignaciones', H.payloadAsignacion([{ habitacionId: await id('103'), ocupantes: 1 }], { fechaSalidaEstimada: H.fechaMas(3) }));
  assert.equal(r.status, 201);
  assert.equal(r.body.noches, 3);
  assert.equal(r.body.costoTotal, 120000);
  const activas = await s.get('/api/asignaciones/activas');
  assert.equal(activas.body[0].noches, 3);
  assert.equal(activas.body[0].costo_total, 120000);
});

test('CP-45 | FRACASO | Habitación Simple con 2 ocupantes (capacidad 1 por tipo) | 422 y la habitación sigue DISPONIBLE', async () => {
  const { s, id } = await preparar();
  const r = await s.post('/api/asignaciones', H.payloadAsignacion([{ habitacionId: await id('103'), ocupantes: 2 }]));
  assert.equal(r.status, 422);
  assert.match(r.body.error, /máximo de 1/);
  assert.equal(await H.estadoHabitacion(s, '103'), 'DISPONIBLE');
});

test('CP-46 | ÉXITO | Capacidad según tipo: Simple 1, Doble 2, Suite 3, Familiar 4 | Habitaciones con la capacidad de su tipo y Familiar acepta 4 ocupantes', async () => {
  const { s, id } = await preparar();
  const lista = (await s.get('/api/habitaciones')).body;
  const esperado = { SIMPLE: 1, DOBLE: 2, SUITE: 3, FAMILIAR: 4 };
  for (const hab of lista) assert.equal(hab.capacidad_maxima, esperado[hab.tipo], `habitación ${hab.numero}`);
  const r = await s.post('/api/asignaciones', H.payloadAsignacion([{ habitacionId: await id('112'), ocupantes: 4 }]));
  assert.equal(r.status, 201);
  assert.equal(r.body.costoTotal, 320000);
});

test('CP-47 | FRACASO | El cliente intenta fijar una capacidad distinta a la del tipo (Simple con capacidad 10) | 201 pero la capacidad queda en 1: se ignora el valor enviado', async () => {
  const { s } = await preparar();
  const r = await s.post('/api/habitaciones', { numero: '301', tipo: 'SIMPLE', orientacion: 'VISTA_CIUDAD', capacidadMaxima: 10 });
  assert.equal(r.status, 201);
  assert.equal(r.body.capacidad_maxima, 1);
});

test('CP-48 | FRACASO | Cambiar el tipo de una habitación ocupada | 409, no se altera la capacidad con huéspedes dentro', async () => {
  const { s, id } = await preparar();
  const hab = await id('101');
  await s.post('/api/asignaciones', H.payloadAsignacion([{ habitacionId: hab, ocupantes: 2 }]));
  const r = await s.put(`/api/habitaciones/${hab}`, { numero: '101', tipo: 'SIMPLE', orientacion: 'VISTA_MAR' });
  assert.equal(r.status, 409);
});

test('CP-49 | ÉXITO | Consumo de servicios externos (Open-Meteo y mindicador.cl) | 200 con temperatura, descripción del clima y valor del dólar', async () => {
  const f = H.fetchFalso();
  const { s } = await preparar({ fetch: f });
  const clima = await s.get('/api/externos/clima');
  const dolar = await s.get('/api/externos/dolar');
  assert.equal(clima.status, 200);
  assert.equal(clima.body.disponible, true);
  assert.equal(clima.body.temperatura, 19);
  assert.equal(clima.body.descripcion, 'Parcialmente nublado');
  assert.equal(dolar.body.valor, 945.5);
  assert.ok(f.llamadas.some((u) => u.includes('api.open-meteo.com')) && f.llamadas.some((u) => u.includes('mindicador.cl/api')));
});

test('CP-50 | FRACASO | Servicio externo caído (sin conexión) | 200 con disponible=false y el resto del sistema sigue funcionando', async () => {
  const { s } = await preparar({ fetch: H.fetchFalso({ falla: true }) });
  const r = await s.get('/api/externos/dolar');
  assert.equal(r.status, 200);
  assert.equal(r.body.disponible, false);
  assert.equal((await s.get('/api/habitaciones')).status, 200);
});

test('CP-51 | ÉXITO | Caché de servicios externos | Dos consultas seguidas realizan una sola llamada al tercero', async () => {
  const f = H.fetchFalso();
  const { s } = await preparar({ fetch: f });
  await s.get('/api/externos/dolar');
  await s.get('/api/externos/dolar');
  assert.equal(f.llamadas.filter((u) => u.includes('mindicador')).length, 1);
});

test('CP-52 | FRACASO | Acceso a servicios externos sin sesión o con rol Administrador | 401 sin sesión y 403 como Administrador', async () => {
  const { app } = H.crearEntorno({ fetch: H.fetchFalso() });
  assert.equal((await H.request(app).get('/api/externos/clima')).status, 401);
  const a = await H.comoAdmin(app);
  assert.equal((await a.get('/api/externos/clima')).status, 403);
});
