'use strict';
process.env.NODE_ENV = 'test'; // debe fijarse antes de cargar la configuración
const request = require('supertest');
const config = require('../src/config');
const { abrirDb } = require('../src/data/db');
const { crearApp } = require('../src/presentation/app');
const { sembrarSiVacio } = require('../src/seed');
const V = require('../src/business/validadores');

function crearEntorno(deps = {}) {
  const db = abrirDb(':memory:');
  sembrarSiVacio(db, config);
  return { db, app: crearApp(db, config, deps) };
}

// Simula Open-Meteo y mindicador.cl sin salir a internet (las pruebas deben ser repetibles)
function fetchFalso({ falla = false } = {}) {
  const fn = async (url) => {
    fn.llamadas.push(String(url));
    if (falla) throw new Error('sin conexión');
    if (String(url).includes('open-meteo')) {
      return { ok: true, status: 200, json: async () => ({ current: { temperature_2m: 18.6, weather_code: 2, wind_speed_10m: 14.2 } }) };
    }
    if (String(url).includes('mindicador')) {
      return { ok: true, status: 200, json: async () => ({ dolar: { valor: 945.5, fecha: '2026-10-13T03:00:00.000Z' } }) };
    }
    throw new Error(`URL inesperada: ${url}`);
  };
  fn.llamadas = [];
  return fn;
}

// Sesión autenticada que adjunta automáticamente el token CSRF
async function iniciarSesion(app, username, password) {
  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({ username, password });
  if (login.status !== 200) throw new Error(`No se pudo iniciar sesión como ${username}: ${login.status}`);
  const token = login.body.csrfToken;
  const con = (m) => (url, body) => {
    const r = agent[m](url).set('X-CSRF-Token', token);
    return body === undefined ? r : r.send(body);
  };
  return { agent, login, get: (u) => agent.get(u), post: con('post'), put: con('put'), patch: con('patch'), delete: con('delete') };
}

const comoEncargado = (app) => iniciarSesion(app, 'encargado', 'Encargado#2026');
const comoAdmin = (app) => iniciarSesion(app, 'admin', 'Admin#2026');

const rutDe = (cuerpo) => `${cuerpo}-${V.calcularDv(cuerpo)}`;
const hoy = () => V.hoyChile();
const fechaMas = (dias) => new Date(Date.now() + dias * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });

async function idHabitacion(s, numero) {
  const r = await s.get('/api/habitaciones');
  return r.body.find((h) => h.numero === numero).id;
}
async function estadoHabitacion(s, numero) {
  const r = await s.get('/api/habitaciones');
  return r.body.find((h) => h.numero === numero)?.estado;
}

// Payload válido por defecto; se puede sobrescribir cualquier campo
function payloadAsignacion(habitaciones, extra = {}) {
  return {
    pasajero: { nombreCompleto: 'Ana Torres Muñoz', rut: rutDe('15432167'), email: 'ana.torres@correo.cl' },
    fechaEntrada: hoy(),
    fechaSalidaEstimada: fechaMas(2),
    esGrupo: false,
    habitaciones,
    ...extra,
  };
}

module.exports = { crearEntorno, fetchFalso, iniciarSesion, comoEncargado, comoAdmin, rutDe, hoy, fechaMas, idHabitacion, estadoHabitacion, payloadAsignacion, request };
