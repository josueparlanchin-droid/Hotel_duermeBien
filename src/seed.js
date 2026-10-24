'use strict';
// Datos iniciales: usuarios y habitaciones del hotel (se ejecuta solo si la BD está vacía)
const bcrypt = require('bcryptjs');
const { CAPACIDAD_POR_TIPO } = require('./business/reglas');

// Capacidad según tipo: Simple 1, Doble 2, Suite 3, Familiar 4 (ver src/business/reglas.js)
const HABITACIONES = [
  ['101', 'DOBLE', 'VISTA_MAR'], ['102', 'DOBLE', 'VISTA_CIUDAD'], ['103', 'SIMPLE', 'VISTA_CIUDAD'],
  ['104', 'SUITE', 'VISTA_MAR'], ['105', 'SIMPLE', 'VISTA_CIUDAD'], ['106', 'DOBLE', 'VISTA_MAR'],
  ['107', 'SIMPLE', 'VISTA_MAR'], ['108', 'SUITE', 'VISTA_CIUDAD'], ['109', 'DOBLE', 'VISTA_CIUDAD'],
  ['110', 'SIMPLE', 'VISTA_MAR'], ['111', 'DOBLE', 'VISTA_MAR'], ['112', 'FAMILIAR', 'VISTA_MAR'],
];

const USUARIOS = [
  { username: 'admin', nombre: 'Administrador del Sistema', rut: '11111111-1', rol: 'ADMINISTRADOR', pass: 'Admin#2026' },
  { username: 'encargado', nombre: 'Marcela Rojas Pérez', rut: '12345678-5', rol: 'ENCARGADO', pass: 'Encargado#2026' },
];

function sembrarSiVacio(db, config) {
  const hayUsuarios = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n > 0;
  if (hayUsuarios) return false;
  const ahora = new Date().toISOString();
  const tx = db.transaction(() => {
    for (const u of USUARIOS) {
      db.prepare('INSERT INTO usuarios (username, nombre_completo, rut, password_hash, rol, activo, creado_en) VALUES (?,?,?,?,?,1,?)')
        .run(u.username, u.nombre, u.rut, bcrypt.hashSync(u.pass, config.BCRYPT_ROUNDS), u.rol, ahora);
    }
    for (const [numero, tipo, ori] of HABITACIONES) {
      db.prepare('INSERT INTO habitaciones (numero, tipo, capacidad_maxima, orientacion) VALUES (?,?,?,?)').run(numero, tipo, CAPACIDAD_POR_TIPO[tipo], ori);
    }
  });
  tx();
  return true;
}

module.exports = { sembrarSiVacio, USUARIOS };
