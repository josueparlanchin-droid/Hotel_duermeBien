'use strict';
// Carga estadías de ejemplo para la demostración (usa la capa de negocio, respeta todas las reglas)
const config = require('../src/config');
const { abrirDb } = require('../src/data/db');
const { sembrarSiVacio } = require('../src/seed');
const { crearRepos } = require('../src/data/repositorios');
const { crearServicios } = require('../src/business');
const V = require('../src/business/validadores');

const db = abrirDb(config.DB_PATH);
sembrarSiVacio(db, config);
const repos = crearRepos(db);
const svc = crearServicios(repos, db, config);
const actor = repos.usuarios.porUsername('encargado');
const hoy = V.hoyChile();
const salida = new Date(Date.now() + 3 * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
const hab = (n) => repos.habitaciones.porNumeroActiva(n);

const casos = [
  { pasajero: { nombreCompleto: 'Ana Torres Muñoz', rut: '15432167-' + V.calcularDv('15432167'), email: 'ana.torres@correo.cl' }, habitaciones: [{ habitacionId: hab('102').id, ocupantes: 2 }] },
  { pasajero: { nombreCompleto: 'Pedro Soto Vidal', rut: '9876543-' + V.calcularDv('9876543') }, habitaciones: [{ habitacionId: hab('105').id, ocupantes: 1 }] },
  { esGrupo: true, acompanantes: 'Luis Fuentes, Carla Fuentes, Mateo Fuentes', pasajero: { nombreCompleto: 'Rodrigo Fuentes Lagos', rut: '13579246-' + V.calcularDv('13579246') }, habitaciones: [{ habitacionId: hab('112').id, ocupantes: 4 }, { habitacionId: hab('109').id, ocupantes: 2 }] },
];
for (const c of casos) {
  try {
    svc.asignaciones.crear({ fechaEntrada: hoy, fechaSalidaEstimada: salida, esGrupo: false, ...c }, actor, '127.0.0.1');
    console.log('OK  ', c.pasajero.nombreCompleto);
  } catch (e) { console.log('SALTADO', c.pasajero.nombreCompleto, '-', e.message); }
}
// Una habitación en mantenimiento para mostrar todos los estados
try { svc.habitaciones.cambiarEstado(hab('106').id, 'EN_MANTENIMIENTO', actor, '127.0.0.1'); } catch (_) { /* ya estaba */ }
console.log('Datos de demostración cargados.');
