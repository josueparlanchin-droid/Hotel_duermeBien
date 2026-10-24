'use strict';
// CAPA DE DATOS - Conexión y esquema relacional (SQLite, motor libre)
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  username          TEXT NOT NULL UNIQUE,
  nombre_completo   TEXT NOT NULL,
  rut               TEXT NOT NULL UNIQUE,
  password_hash     TEXT NOT NULL,
  rol               TEXT NOT NULL CHECK (rol IN ('ADMINISTRADOR','ENCARGADO')),
  activo            INTEGER NOT NULL DEFAULT 1,
  intentos_fallidos INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta   INTEGER,
  creado_en         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS habitaciones (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  numero           TEXT NOT NULL,
  tipo             TEXT NOT NULL CHECK (tipo IN ('SIMPLE','DOBLE','SUITE','FAMILIAR')),
  capacidad_maxima INTEGER NOT NULL CHECK (capacidad_maxima BETWEEN 1 AND 10),
  orientacion      TEXT NOT NULL CHECK (orientacion IN ('VISTA_MAR','VISTA_CIUDAD')),
  estado           TEXT NOT NULL DEFAULT 'DISPONIBLE'
                   CHECK (estado IN ('DISPONIBLE','OCUPADA','EN_LIMPIEZA','EN_MANTENIMIENTO')),
  activa           INTEGER NOT NULL DEFAULT 1
);
-- El número es único solo entre habitaciones activas (la eliminación es lógica y conserva el historial)
CREATE UNIQUE INDEX IF NOT EXISTS ux_habitacion_numero_activa ON habitaciones(numero) WHERE activa = 1;

CREATE TABLE IF NOT EXISTS pasajeros (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  rut             TEXT NOT NULL UNIQUE,
  nombre_completo TEXT NOT NULL,
  email           TEXT,
  telefono        TEXT,
  creado_en       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS asignaciones (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  grupo_id              TEXT NOT NULL,
  habitacion_id         INTEGER NOT NULL REFERENCES habitaciones(id),
  pasajero_id           INTEGER NOT NULL REFERENCES pasajeros(id),
  cantidad_ocupantes    INTEGER NOT NULL CHECK (cantidad_ocupantes >= 1),
  acompanantes          TEXT,
  fecha_entrada         TEXT NOT NULL,
  fecha_salida_estimada TEXT NOT NULL,
  fecha_salida_real     TEXT,
  noches                INTEGER NOT NULL CHECK (noches >= 1),
  tarifa_noche          INTEGER NOT NULL,
  costo_total           INTEGER NOT NULL,
  estado                TEXT NOT NULL CHECK (estado IN ('ACTIVA','FINALIZADA')),
  creado_en             TEXT NOT NULL,
  usuario_id            INTEGER NOT NULL REFERENCES usuarios(id)
);
CREATE INDEX IF NOT EXISTS ix_asig_habitacion ON asignaciones(habitacion_id, estado);
CREATE INDEX IF NOT EXISTS ix_asig_pasajero ON asignaciones(pasajero_id);

CREATE TABLE IF NOT EXISTS auditoria (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha      TEXT NOT NULL,
  usuario_id INTEGER,
  username   TEXT,
  accion     TEXT NOT NULL,
  detalle    TEXT,
  ip         TEXT
);

CREATE TABLE IF NOT EXISTS sesiones (
  sid    TEXT PRIMARY KEY,
  sess   TEXT NOT NULL,
  expire INTEGER NOT NULL
);
`;

const VERSION_ESQUEMA = 2;

function abrirDb(archivo) {
  if (archivo !== ':memory:') fs.mkdirSync(path.dirname(archivo), { recursive: true });
  const db = new Database(archivo);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON'); // integridad referencial

  const existente = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='usuarios'").get();
  const version = db.pragma('user_version', { simple: true });
  if (existente && version < VERSION_ESQUEMA) {
    db.close();
    throw new Error(
      `La base de datos ${archivo} es de una versión anterior (orientaciones, noches y capacidad por tipo cambiaron).\n` +
      'Bórrela para recrearla con los datos iniciales:  elimine el archivo data/duerme-bien.db y vuelva a ejecutar npm start.'
    );
  }
  db.exec(SCHEMA);
  db.pragma(`user_version = ${VERSION_ESQUEMA}`);
  return db;
}

module.exports = { abrirDb };
