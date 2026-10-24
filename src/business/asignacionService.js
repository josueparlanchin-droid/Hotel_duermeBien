'use strict';
// CAPA DE NEGOCIO - Asignación de habitaciones y check-out
// RF-6, RF-7, RF-8, RF-9, CU-07..CU-12, RN01..RN04
const crypto = require('crypto');
const V = require('./validadores');
const { AppError } = require('../errors');

const ETIQUETA = { DISPONIBLE: 'Disponible', OCUPADA: 'Ocupada', EN_LIMPIEZA: 'En limpieza', EN_MANTENIMIENTO: 'En mantenimiento' };

function crearAsignacionService(repos, db, config) {
  const crearTx = db.transaction((ctx) => {
    const { p, items, entrada, salida, noches, acomp, actor, ip } = ctx;

    // 1) Validar TODAS las habitaciones antes de escribir (atomicidad)
    const validadas = items.map((it) => {
      const h = repos.habitaciones.porId(it.habitacionId);
      if (!h || !h.activa) throw new AppError(404, 'Habitación no encontrada.', 'NO_ENCONTRADO');
      // RN01 / RF-7: solo se asigna una habitación estrictamente "Disponible"
      if (h.estado !== 'DISPONIBLE') {
        throw new AppError(409, `La habitación ${h.numero} no está disponible (estado actual: ${ETIQUETA[h.estado]}).`, 'NO_DISPONIBLE');
      }
      // RN03: no superar la capacidad máxima
      if (it.ocupantes > h.capacidad_maxima) {
        throw new AppError(422, `La habitación ${h.numero} admite un máximo de ${h.capacidad_maxima} ocupantes.`, 'CAPACIDAD');
      }
      return { h, ocupantes: it.ocupantes };
    });

    // 2) Pasajero responsable: se reutiliza si ya existe (RF-5)
    const existente = repos.pasajeros.porRut(p.rut);
    let pasajeroId;
    if (existente) {
      pasajeroId = existente.id;
      repos.pasajeros.actualizar(pasajeroId, {
        nombre_completo: p.nombre,
        email: p.email ?? existente.email,
        telefono: p.telefono ?? existente.telefono,
      });
    } else {
      pasajeroId = repos.pasajeros.crear({ rut: p.rut, nombre_completo: p.nombre, email: p.email, telefono: p.telefono, creado_en: new Date().toISOString() });
    }

    // 3) Crear asignaciones (una por habitación, unidas por grupo_id) + CU-08 costo + CU-09 timestamp
    const grupoId = crypto.randomUUID();
    const creadoEn = new Date().toISOString();
    const asignaciones = validadas.map(({ h, ocupantes }) => {
      // CU-08: tarifa por pasajero y por noche (ocupantes × noches × $40.000)
      const costo = ocupantes * noches * config.TARIFA_POR_PASAJERO;
      const id = repos.asignaciones.crear({
        grupo_id: grupoId, habitacion_id: h.id, pasajero_id: pasajeroId, cantidad_ocupantes: ocupantes,
        acompanantes: acomp, fecha_entrada: entrada, fecha_salida_estimada: salida,
        noches, tarifa_noche: config.TARIFA_POR_PASAJERO, costo_total: costo, creado_en: creadoEn, usuario_id: actor.id,
      });
      repos.habitaciones.setEstado(h.id, 'OCUPADA');
      return { id, habitacion: h.numero, ocupantes, noches, costo };
    });

    repos.auditoria.registrar({
      usuarioId: actor.id, username: actor.username, accion: 'ASIGNACION_CREADA',
      detalle: `${p.rut} -> hab. ${asignaciones.map((a) => a.habitacion).join(', ')}`, ip,
    });

    return {
      grupoId, creadoEn, pasajeroId, responsable: { rut: p.rut, nombre: p.nombre },
      asignaciones, costoTotal: asignaciones.reduce((s, a) => s + a.costo, 0),
      fechaEntrada: entrada, fechaSalidaEstimada: salida, noches, tarifaPorNoche: config.TARIFA_POR_PASAJERO,
    };
  });

  return {
    crear(datos, actor, ip) {
      const pas = datos.pasajero || {};
      const p = {
        nombre: V.nombre(pas.nombreCompleto, 'Nombre del pasajero responsable'),
        rut: V.rut(pas.rut, 'RUT del pasajero responsable'), // RN02
        email: V.emailOpcional(pas.email),
        telefono: V.telefonoOpcional(pas.telefono),
      };
      const entrada = V.fecha(datos.fechaEntrada, 'Fecha de entrada');
      const salida = V.fecha(datos.fechaSalidaEstimada, 'Fecha estimada de salida');
      if (entrada !== V.hoyChile()) throw new AppError(400, 'La fecha de entrada debe ser la fecha actual (check-in).', 'VALIDACION');
      if (salida <= entrada) throw new AppError(400, 'La fecha de salida debe ser posterior a la de entrada.', 'VALIDACION');

      const esGrupo = datos.esGrupo === true;
      const acomp = esGrupo ? V.textoOpcional(datos.acompanantes, 'Acompañantes') : null;

      if (!Array.isArray(datos.habitaciones) || datos.habitaciones.length < 1) throw new AppError(400, 'Debe seleccionar al menos una habitación.', 'VALIDACION');
      if (datos.habitaciones.length > 10) throw new AppError(400, 'Máximo 10 habitaciones por grupo.', 'VALIDACION');
      // CU-10: reservar múltiples habitaciones solo aplica a grupos
      if (datos.habitaciones.length > 1 && !esGrupo) throw new AppError(400, 'Para asignar más de una habitación debe marcar la estadía como grupo.', 'VALIDACION');

      const items = datos.habitaciones.map((h) => ({
        habitacionId: V.entero(h?.habitacionId, 'Habitación', 1, 1e9),
        ocupantes: V.entero(h?.ocupantes, 'La cantidad de ocupantes', 1, 10),
      }));
      if (new Set(items.map((i) => i.habitacionId)).size !== items.length) throw new AppError(400, 'No puede repetir una habitación.', 'VALIDACION');

      return crearTx({ p, items, entrada, salida, noches: V.nochesEntre(entrada, salida), acomp, actor, ip });
    },

    activas: () => repos.asignaciones.activas(),

    // RF-8 + RN04: registra salida real y deja la habitación "En limpieza"
    checkout: db.transaction((id, actor, ip) => {
      const a = repos.asignaciones.porId(id);
      if (!a) throw new AppError(404, 'Asignación no encontrada.', 'NO_ENCONTRADO');
      if (a.estado !== 'ACTIVA') throw new AppError(409, 'La estadía ya fue finalizada.', 'CONFLICTO');
      repos.asignaciones.finalizar(id, new Date().toISOString());
      repos.habitaciones.setEstado(a.habitacion_id, 'EN_LIMPIEZA');
      repos.auditoria.registrar({ usuarioId: actor.id, username: actor.username, accion: 'CHECKOUT', detalle: `Hab. ${a.habitacion_numero} - ${a.pasajero_rut}`, ip });
      return repos.asignaciones.porId(id);
    }),

    // RF-9: historial por habitación y/o pasajero
    historial({ habitacionId, rut }) {
      let pasajeroId;
      if (rut) {
        const p = repos.pasajeros.porRut(V.rut(rut));
        if (!p) return [];
        pasajeroId = p.id;
      }
      return repos.asignaciones.historial({ habitacionId: habitacionId ? V.idParam(habitacionId) : undefined, pasajeroId });
    },
  };
}

module.exports = { crearAsignacionService };
