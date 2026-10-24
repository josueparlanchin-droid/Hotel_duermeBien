'use strict';
// CAPA DE NEGOCIO - Pasajeros (RF-5, RNF-08)
const V = require('./validadores');
const { AppError } = require('../errors');

function crearPasajeroService(repos) {
  return {
    buscarPorRut(rutEntrada) {
      const p = repos.pasajeros.porRut(V.rut(rutEntrada));
      if (!p) throw new AppError(404, 'Pasajero no registrado.', 'NO_ENCONTRADO');
      return p;
    },

    actualizarContacto(id, datos, actor, ip) {
      const p = repos.pasajeros.porId(id);
      if (!p) throw new AppError(404, 'Pasajero no encontrado.', 'NO_ENCONTRADO');
      repos.pasajeros.actualizar(id, {
        nombre_completo: p.nombre_completo,
        email: V.emailOpcional(datos.email),
        telefono: V.telefonoOpcional(datos.telefono),
      });
      repos.auditoria.registrar({ usuarioId: actor.id, username: actor.username, accion: 'PASAJERO_ACTUALIZADO', detalle: p.rut, ip });
      return repos.pasajeros.porId(id);
    },
  };
}

module.exports = { crearPasajeroService };
