'use strict';
const { crearAuthService } = require('./authService');
const { crearUsuarioService } = require('./usuarioService');
const { crearHabitacionService } = require('./habitacionService');
const { crearPasajeroService } = require('./pasajeroService');
const { crearAsignacionService } = require('./asignacionService');

function crearServicios(repos, db, config) {
  return {
    auth: crearAuthService(repos, config),
    usuarios: crearUsuarioService(repos, config),
    habitaciones: crearHabitacionService(repos),
    pasajeros: crearPasajeroService(repos),
    asignaciones: crearAsignacionService(repos, db, config),
    auditoria: { listar: () => repos.auditoria.listar(200) },
  };
}
module.exports = { crearServicios };
