'use strict';
const path = require('path');

const esProd = process.env.NODE_ENV === 'production';
const esTest = process.env.NODE_ENV === 'test';

const config = {
  PORT: Number(process.env.PORT) || 3000,
  DB_PATH: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'duerme-bien.db'),
  SESSION_SECRET: process.env.SESSION_SECRET || 'dev-secret-solo-para-desarrollo-local',
  // Regla de negocio (CU-08): tarifa fija por pasajero asignado, solo informativa (RE-4)
  TARIFA_POR_PASAJERO: 40000,
  // ISO 27002: expiración de sesión por inactividad
  SESSION_IDLE_MS: 20 * 60 * 1000,
  // OWASP A07: bloqueo de cuenta tras intentos fallidos
  MAX_INTENTOS: 5,
  BLOQUEO_MS: 15 * 60 * 1000,
  // RNF-07: hash bcrypt
  BCRYPT_ROUNDS: esTest ? 4 : 12,
  LOGIN_LIMIT_IP: esTest ? 10000 : 30, // intentos por IP cada 15 min
  // Ubicación del hotel (servicio externo de clima). Cambiar según la ciudad real.
  HOTEL_CIUDAD: process.env.HOTEL_CIUDAD || 'Viña del Mar',
  HOTEL_LAT: Number(process.env.HOTEL_LAT) || -33.0245,
  HOTEL_LON: Number(process.env.HOTEL_LON) || -71.5518,
  EXTERNOS_TIMEOUT_MS: 4000,
  EXTERNOS_CACHE_MS: 10 * 60 * 1000,
  esProd,
  esTest,
};

if (esProd && config.SESSION_SECRET.startsWith('dev-secret')) {
  throw new Error('Defina la variable de entorno SESSION_SECRET en producción.');
}

module.exports = config;
