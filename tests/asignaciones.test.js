'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');

async function preparar() {
  const { app, db } = H.crearEntorno();
  const s = await H.comoEncargado(app);
  const id = (n) => H.idHabitacion(s, n);
  return { app, db, s, id };
}

test('CP-25 | ÉXITO | Asignar habitación disponible dentro de su capacidad (RF-6, CU-07, CU-08, CU-09) | 201, costo 2 ocupantes × 2 noches × $40.000 = $160.000, habitación OCUPADA y fecha/hora registrada', async () => {
  const { s, id } = await preparar();
  const r = await s.post('/api/asignaciones', H.payloadAsignacion([{ habitacionId: await id('101'), ocupantes: 2 }]));
  assert.equal(r.status, 201);
  assert.equal(r.body.costoTotal, 160000);
  assert.equal(r.body.noches, 2);
  assert.equal(await H.estadoHabitacion(s, '101'), 'OCUPADA');
  assert.ok(!Number.isNaN(Date.parse(r.body.creadoEn)));
});

test('CP-26 | FRACASO | Asignar con RUT inválido (RN02) | 400 y la habitación sigue DISPONIBLE', async () => {
  const { s, id } = await preparar();
  const r = await s.post('/api/asignaciones', H.payloadAsignacion([{ habitacionId: await id('101'), ocupantes: 1 }], {
    pasajero: { nombreCompleto: 'Ana Torres Muñoz', rut: '12345678-9' },
  }));
  assert.equal(r.status, 400);
  assert.equal(await H.estadoHabitacion(s, '101'), 'DISPONIBLE');
});

test('CP-27 | FRACASO | Ocupantes superan la capacidad máxima (RN03) | 422 y la habitación sigue DISPONIBLE', async () => {
  const { s, id } = await preparar();
  const r = await s.post('/api/asignaciones', H.payloadAsignacion([{ habitacionId: await id('101'), ocupantes: 3 }]));
  assert.equal(r.status, 422);
  assert.match(r.body.error, /máximo de 2/);
  assert.equal(await H.estadoHabitacion(s, '101'), 'DISPONIBLE');
});

test('CP-28 | FRACASO | Asignar una habitación ya ocupada (RN01, RF-7) | 409 y no se crea una segunda asignación', async () => {
  const { s, id, db } = await preparar();
  const hab = await id('101');
  assert.equal((await s.post('/api/asignaciones', H.payloadAsignacion([{ habitacionId: hab, ocupantes: 1 }]))).status, 201);
  const r = await s.post('/api/asignaciones', H.payloadAsignacion([{ habitacionId: hab, ocupantes: 1 }], {
    pasajero: { nombreCompleto: 'Pedro Soto Vidal', rut: H.rutDe('9876543') },
  }));
  assert.equal(r.status, 409);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM asignaciones WHERE estado='ACTIVA'").get().n, 1);
});

test('CP-29 | FRACASO | Asignar una habitación en mantenimiento (RN01) | 409 con el estado actual en el mensaje', async () => {
  const { s, id } = await preparar();
  const hab = await id('101');
  await s.patch(`/api/habitaciones/${hab}/estado`, { estado: 'EN_MANTENIMIENTO' });
  const r = await s.post('/api/asignaciones', H.payloadAsignacion([{ habitacionId: hab, ocupantes: 1 }]));
  assert.equal(r.status, 409);
  assert.match(r.body.error, /mantenimiento/i);
});

test('CP-30 | ÉXITO | Grupo distribuido en varias habitaciones con un responsable (CU-10) | 201, 2 asignaciones, costo 5 personas × 2 noches × $40.000 = $400.000 y ambas OCUPADAS', async () => {
  const { s, id } = await preparar();
  const r = await s.post('/api/asignaciones', H.payloadAsignacion(
    [{ habitacionId: await id('104'), ocupantes: 3 }, { habitacionId: await id('101'), ocupantes: 2 }],
    { esGrupo: true, acompanantes: 'Luis Fuentes, Carla Fuentes' }
  ));
  assert.equal(r.status, 201);
  assert.equal(r.body.asignaciones.length, 2);
  assert.equal(r.body.costoTotal, 400000);
  assert.equal(r.body.responsable.rut, H.rutDe('15432167'));
  assert.equal(await H.estadoHabitacion(s, '104'), 'OCUPADA');
  assert.equal(await H.estadoHabitacion(s, '101'), 'OCUPADA');
});

test('CP-31 | FRACASO | Varias habitaciones sin marcar la estadía como grupo | 400', async () => {
  const { s, id } = await preparar();
  const r = await s.post('/api/asignaciones', H.payloadAsignacion(
    [{ habitacionId: await id('104'), ocupantes: 2 }, { habitacionId: await id('101'), ocupantes: 2 }]
  ));
  assert.equal(r.status, 400);
});

test('CP-32 | FRACASO | Fecha de salida igual o anterior a la de entrada | 400', async () => {
  const { s, id } = await preparar();
  const r = await s.post('/api/asignaciones', H.payloadAsignacion([{ habitacionId: await id('101'), ocupantes: 1 }], { fechaSalidaEstimada: H.hoy() }));
  assert.equal(r.status, 400);
});

test('CP-33 | FRACASO | Fecha de entrada distinta a la fecha actual | 400', async () => {
  const { s, id } = await preparar();
  const r = await s.post('/api/asignaciones', H.payloadAsignacion([{ habitacionId: await id('101'), ocupantes: 1 }], { fechaEntrada: H.fechaMas(-3), fechaSalidaEstimada: H.fechaMas(1) }));
  assert.equal(r.status, 400);
});

test('CP-34 | ÉXITO | Check-out de un huésped (RF-8, RN04) | 200, fecha real de salida registrada y habitación EN_LIMPIEZA', async () => {
  const { s, id } = await preparar();
  const a = await s.post('/api/asignaciones', H.payloadAsignacion([{ habitacionId: await id('101'), ocupantes: 2 }]));
  const r = await s.post(`/api/asignaciones/${a.body.asignaciones[0].id}/checkout`);
  assert.equal(r.status, 200);
  assert.equal(r.body.estado, 'FINALIZADA');
  assert.ok(r.body.fecha_salida_real);
  assert.equal(await H.estadoHabitacion(s, '101'), 'EN_LIMPIEZA');
});

test('CP-35 | FRACASO | Reasignar una habitación inmediatamente después del check-out (RN04) | 409 hasta que el personal la marque como lista', async () => {
  const { s, id } = await preparar();
  const hab = await id('101');
  const a = await s.post('/api/asignaciones', H.payloadAsignacion([{ habitacionId: hab, ocupantes: 1 }]));
  await s.post(`/api/asignaciones/${a.body.asignaciones[0].id}/checkout`);
  const r = await s.post('/api/asignaciones', H.payloadAsignacion([{ habitacionId: hab, ocupantes: 1 }]));
  assert.equal(r.status, 409);
  assert.match(r.body.error, /limpieza/i);
});

test('CP-36 | ÉXITO | Marcar la habitación como lista y volver a asignarla | 200 y nueva asignación 201', async () => {
  const { s, id } = await preparar();
  const hab = await id('101');
  const a = await s.post('/api/asignaciones', H.payloadAsignacion([{ habitacionId: hab, ocupantes: 1 }]));
  await s.post(`/api/asignaciones/${a.body.asignaciones[0].id}/checkout`);
  assert.equal((await s.patch(`/api/habitaciones/${hab}/estado`, { estado: 'DISPONIBLE' })).status, 200);
  assert.equal((await s.post('/api/asignaciones', H.payloadAsignacion([{ habitacionId: hab, ocupantes: 1 }]))).status, 201);
});

test('CP-37 | FRACASO | Check-out de una estadía ya finalizada | 409', async () => {
  const { s, id } = await preparar();
  const a = await s.post('/api/asignaciones', H.payloadAsignacion([{ habitacionId: await id('101'), ocupantes: 1 }]));
  const aid = a.body.asignaciones[0].id;
  assert.equal((await s.post(`/api/asignaciones/${aid}/checkout`)).status, 200);
  assert.equal((await s.post(`/api/asignaciones/${aid}/checkout`)).status, 409);
});

test('CP-38 | FRACASO | Grupo con una habitación válida y otra no disponible (atomicidad) | 409 y NINGUNA habitación queda ocupada', async () => {
  const { s, id, db } = await preparar();
  const h102 = await id('102');
  await s.patch(`/api/habitaciones/${h102}/estado`, { estado: 'EN_MANTENIMIENTO' });
  const r = await s.post('/api/asignaciones', H.payloadAsignacion(
    [{ habitacionId: await id('101'), ocupantes: 2 }, { habitacionId: h102, ocupantes: 2 }], { esGrupo: true }
  ));
  assert.equal(r.status, 409);
  assert.equal(await H.estadoHabitacion(s, '101'), 'DISPONIBLE');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM asignaciones').get().n, 0);
});

test('CP-39 | ÉXITO | Consultar historial por habitación y por pasajero (RF-9) | Estadías finalizadas visibles en ambas consultas', async () => {
  const { s, id } = await preparar();
  const hab = await id('101');
  const a = await s.post('/api/asignaciones', H.payloadAsignacion([{ habitacionId: hab, ocupantes: 2 }]));
  await s.post(`/api/asignaciones/${a.body.asignaciones[0].id}/checkout`);
  const porHab = await s.get(`/api/historial?habitacionId=${hab}`);
  const porRut = await s.get(`/api/historial?rut=${H.rutDe('15432167')}`);
  assert.equal(porHab.body.length, 1);
  assert.equal(porRut.body.length, 1);
  assert.equal(porHab.body[0].estado, 'FINALIZADA');
});

test('CP-40 | ÉXITO | Buscar pasajero por RUT y actualizar su contacto (RF-5) | 200 con datos actualizados; 400 con correo inválido; 404 si no existe', async () => {
  const { s, id } = await preparar();
  await s.post('/api/asignaciones', H.payloadAsignacion([{ habitacionId: await id('101'), ocupantes: 1 }]));
  const busq = await s.get(`/api/pasajeros?rut=${H.rutDe('15432167')}`);
  assert.equal(busq.status, 200);
  const upd = await s.put(`/api/pasajeros/${busq.body.id}`, { email: 'nuevo@correo.cl', telefono: '+56 9 1234 5678' });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.email, 'nuevo@correo.cl');
  assert.equal((await s.put(`/api/pasajeros/${busq.body.id}`, { email: 'no-es-correo' })).status, 400);
  assert.equal((await s.get(`/api/pasajeros?rut=${H.rutDe('20000000')}`)).status, 404);
});

test('CP-41 | ÉXITO | Mismo pasajero en dos estadías distintas | Un solo registro de pasajero y dos estadías en su historial', async () => {
  const { s, id, db } = await preparar();
  const h1 = await id('101');
  const a = await s.post('/api/asignaciones', H.payloadAsignacion([{ habitacionId: h1, ocupantes: 1 }]));
  await s.post(`/api/asignaciones/${a.body.asignaciones[0].id}/checkout`);
  await s.post('/api/asignaciones', H.payloadAsignacion([{ habitacionId: await id('103'), ocupantes: 1 }]));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM pasajeros').get().n, 1);
  const h = await s.get(`/api/historial?rut=${H.rutDe('15432167')}`);
  assert.equal(h.body.length, 2);
});

test('CP-42 | ÉXITO | Consultar pasajeros hospedados (CU-12) | Lista con habitación, RUT del responsable y cantidad de ocupantes', async () => {
  const { s, id } = await preparar();
  await s.post('/api/asignaciones', H.payloadAsignacion([{ habitacionId: await id('104'), ocupantes: 3 }]));
  const r = await s.get('/api/asignaciones/activas');
  assert.equal(r.status, 200);
  assert.equal(r.body.length, 1);
  assert.equal(r.body[0].habitacion_numero, '104');
  assert.equal(r.body[0].pasajero_rut, H.rutDe('15432167'));
  assert.equal(r.body[0].cantidad_ocupantes, 3);
});

test('CP-43 | ÉXITO | Registro de auditoría de operaciones sensibles (ISO 27002) | El Administrador ve intentos fallidos, inicios de sesión y asignaciones', async () => {
  const { app } = H.crearEntorno();
  await H.request(app).post('/api/auth/login').send({ username: 'encargado', password: 'incorrecta' });
  const s = await H.comoEncargado(app);
  await s.post('/api/asignaciones', H.payloadAsignacion([{ habitacionId: await H.idHabitacion(s, '101'), ocupantes: 1 }]));
  const a = await H.comoAdmin(app);
  const r = await a.get('/api/auditoria');
  const acciones = r.body.map((x) => x.accion);
  for (const esperada of ['LOGIN_FALLIDO', 'LOGIN_OK', 'ASIGNACION_CREADA']) assert.ok(acciones.includes(esperada), `falta ${esperada}`);
});
