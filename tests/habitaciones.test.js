'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');

const nueva = (extra = {}) => ({ numero: '201', tipo: 'DOBLE', orientacion: 'VISTA_MAR', ...extra });

test('CP-19 | ÉXITO | Registrar una habitación válida con vista al mar (CU-03, RF-3) | 201, estado DISPONIBLE y capacidad 2 según el tipo Doble', async () => {
  const { app } = H.crearEntorno();
  const s = await H.comoEncargado(app);
  const r = await s.post('/api/habitaciones', nueva());
  assert.equal(r.status, 201);
  assert.equal(r.body.estado, 'DISPONIBLE');
  assert.equal(r.body.capacidad_maxima, 2);
  assert.equal(r.body.orientacion, 'VISTA_MAR');
});

test('CP-20 | FRACASO | Registrar una habitación con número duplicado | 409 Conflicto', async () => {
  const { app } = H.crearEntorno();
  const s = await H.comoEncargado(app);
  const r = await s.post('/api/habitaciones', nueva({ numero: '101' }));
  assert.equal(r.status, 409);
});

test('CP-21 | FRACASO | Registrar habitaciones con tipo inválido o con la orientación antigua "NORTE" | 400 en ambos casos', async () => {
  const { app } = H.crearEntorno();
  const s = await H.comoEncargado(app);
  assert.equal((await s.post('/api/habitaciones', nueva({ tipo: 'PENTHOUSE' }))).status, 400);
  assert.equal((await s.post('/api/habitaciones', nueva({ orientacion: 'NORTE' }))).status, 400);
});

test('CP-22 | ÉXITO | Eliminar una habitación sin pasajeros activos (CU-04) | 200, sale del listado y el historial se conserva', async () => {
  const { app } = H.crearEntorno();
  const s = await H.comoEncargado(app);
  const id = await H.idHabitacion(s, '101');
  const rut = H.rutDe('15432167');
  const a = await s.post('/api/asignaciones', H.payloadAsignacion([{ habitacionId: id, ocupantes: 2 }]));
  await s.post(`/api/asignaciones/${a.body.asignaciones[0].id}/checkout`);
  assert.equal((await s.delete(`/api/habitaciones/${id}`)).status, 200);
  assert.equal(await H.estadoHabitacion(s, '101'), undefined);
  const h = await s.get(`/api/historial?rut=${rut}`);
  assert.equal(h.body.length, 1);
  assert.equal(h.body[0].habitacion_numero, '101');
});

test('CP-23 | FRACASO | Eliminar una habitación con pasajeros activos (CU-05) | 409 y la habitación permanece OCUPADA', async () => {
  const { app } = H.crearEntorno();
  const s = await H.comoEncargado(app);
  const id = await H.idHabitacion(s, '101');
  await s.post('/api/asignaciones', H.payloadAsignacion([{ habitacionId: id, ocupantes: 1 }]));
  const r = await s.delete(`/api/habitaciones/${id}`);
  assert.equal(r.status, 409);
  assert.equal(await H.estadoHabitacion(s, '101'), 'OCUPADA');
});

test('CP-24 | FRACASO | Cambiar manualmente a mantenimiento una habitación ocupada | 409, solo el check-out libera la habitación', async () => {
  const { app } = H.crearEntorno();
  const s = await H.comoEncargado(app);
  const id = await H.idHabitacion(s, '101');
  await s.post('/api/asignaciones', H.payloadAsignacion([{ habitacionId: id, ocupantes: 1 }]));
  const r = await s.patch(`/api/habitaciones/${id}/estado`, { estado: 'EN_MANTENIMIENTO' });
  assert.equal(r.status, 409);
});
