'use strict';
// CAPA DE NEGOCIO - Habitaciones (RF-3, CU-03, CU-04, CU-05, RN01, RN04)
const V = require('./validadores');
const { AppError } = require('../errors');
const { CAPACIDAD_POR_TIPO, TIPOS, ORIENTACIONES } = require('./reglas');

// Transiciones manuales permitidas. OCUPADA solo cambia por check-out (RN04).
const TRANSICIONES = {
  EN_LIMPIEZA: ['DISPONIBLE', 'EN_MANTENIMIENTO'], // "marcar como lista"
  DISPONIBLE: ['EN_MANTENIMIENTO'],
  EN_MANTENIMIENTO: ['DISPONIBLE'],
  OCUPADA: [],
};

function crearHabitacionService(repos) {
  // La capacidad NO la define el usuario: se deriva del tipo de habitación (Simple 1, Doble 2, Suite 3, Familiar 4)
  const leer = (datos) => {
    const tipo = V.opcion(datos.tipo, TIPOS, 'Tipo');
    return {
      numero: V.numeroHabitacion(datos.numero),
      tipo,
      capacidad_maxima: CAPACIDAD_POR_TIPO[tipo],
      orientacion: V.opcion(datos.orientacion, ORIENTACIONES, 'Orientación'),
    };
  };
  const obtener = (id) => {
    const h = repos.habitaciones.porId(id);
    if (!h || !h.activa) throw new AppError(404, 'Habitación no encontrada.', 'NO_ENCONTRADO');
    return h;
  };

  return {
    listar: () => repos.habitaciones.listar(),

    crear(datos, actor, ip) {
      const h = leer(datos);
      if (repos.habitaciones.porNumeroActiva(h.numero)) throw new AppError(409, `Ya existe la habitación ${h.numero}.`, 'DUPLICADO');
      const id = repos.habitaciones.crear(h);
      repos.auditoria.registrar({ usuarioId: actor.id, username: actor.username, accion: 'HABITACION_CREADA', detalle: h.numero, ip });
      return repos.habitaciones.porId(id);
    },

    actualizar(id, datos, actor, ip) {
      const actual = obtener(id);
      const h = leer(datos);
      const otra = repos.habitaciones.porNumeroActiva(h.numero);
      if (otra && otra.id !== id) throw new AppError(409, `Ya existe la habitación ${h.numero}.`, 'DUPLICADO');
      if (actual.estado === 'OCUPADA' && h.tipo !== actual.tipo) {
        throw new AppError(409, 'No se puede cambiar el tipo de una habitación ocupada.', 'CONFLICTO');
      }
      repos.habitaciones.actualizar(id, h);
      repos.auditoria.registrar({ usuarioId: actor.id, username: actor.username, accion: 'HABITACION_ACTUALIZADA', detalle: h.numero, ip });
      return repos.habitaciones.porId(id);
    },

    // CU-04 + CU-05: eliminación lógica, preserva historial, impedida si hay pasajeros activos
    eliminar(id, actor, ip) {
      const h = obtener(id);
      if (h.estado === 'OCUPADA') throw new AppError(409, `La habitación ${h.numero} tiene pasajeros activos y no puede eliminarse.`, 'CONFLICTO');
      repos.habitaciones.desactivar(id);
      repos.auditoria.registrar({ usuarioId: actor.id, username: actor.username, accion: 'HABITACION_ELIMINADA', detalle: h.numero, ip });
    },

    cambiarEstado(id, estado, actor, ip) {
      const h = obtener(id);
      const nuevo = V.opcion(estado, ['DISPONIBLE', 'EN_MANTENIMIENTO'], 'Estado');
      if (!TRANSICIONES[h.estado].includes(nuevo)) {
        throw new AppError(409, `No se puede pasar la habitación ${h.numero} de ${h.estado} a ${nuevo}.`, 'CONFLICTO');
      }
      repos.habitaciones.setEstado(id, nuevo);
      repos.auditoria.registrar({ usuarioId: actor.id, username: actor.username, accion: 'HABITACION_ESTADO', detalle: `${h.numero}: ${h.estado} -> ${nuevo}`, ip });
      return repos.habitaciones.porId(id);
    },
  };
}

module.exports = { crearHabitacionService };
