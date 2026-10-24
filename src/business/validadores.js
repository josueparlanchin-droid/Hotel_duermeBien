'use strict';
// CAPA DE NEGOCIO - Validación y saneamiento de entradas (OWASP A03: Inyección / XSS)
const { AppError } = require('../errors');

const LETRAS = 'A-Za-zÁÉÍÓÚÜÑáéíóúüñ';
const RE_NOMBRE = new RegExp(`^[${LETRAS}][${LETRAS}' .-]{1,99}$`);
const RE_TEXTO = new RegExp(`^[${LETRAS}0-9' .,;-]*$`);
const RE_USERNAME = /^[a-z0-9._-]{3,30}$/;
const RE_EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;
const RE_TELEFONO = /^\+?[0-9 ()-]{7,20}$/;
const RE_NUMERO_HAB = /^[A-Za-z0-9-]{1,10}$/;

const err = (msg) => new AppError(400, msg, 'VALIDACION');
const limpiar = (s) => (typeof s === 'string' ? s.trim().replace(/\s+/g, ' ') : '');

function nombre(v, campo = 'Nombre') {
  const s = limpiar(v);
  if (!RE_NOMBRE.test(s)) throw err(`${campo} inválido: solo letras, espacios, apóstrofes, puntos y guiones (2 a 100 caracteres).`);
  return s;
}

function calcularDv(cuerpo) {
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const r = 11 - (suma % 11);
  return r === 11 ? '0' : r === 10 ? 'K' : String(r);
}

// RN02: documento de identidad válido (RUT chileno, módulo 11). Se almacena como "12345678-5".
function rut(v, campo = 'RUT') {
  if (typeof v !== 'string') throw err(`${campo} es obligatorio.`);
  const s = v.replace(/[.\s]/g, '').toUpperCase();
  const m = /^(\d{7,8})-?([\dK])$/.exec(s);
  if (!m || m[2] !== calcularDv(m[1])) throw err(`${campo} inválido. Verifique el número y el dígito verificador.`);
  return `${m[1]}-${m[2]}`;
}

function username(v) {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (!RE_USERNAME.test(s)) throw err('Usuario inválido: use 3 a 30 caracteres entre letras minúsculas, números, punto, guion o guion bajo.');
  return s;
}

function password(v) {
  if (typeof v !== 'string' || v.length < 8 || v.length > 72 || !/[a-z]/.test(v) || !/[A-Z]/.test(v) || !/\d/.test(v)) {
    throw err('La contraseña debe tener entre 8 y 72 caracteres, con mayúsculas, minúsculas y números.');
  }
  return v;
}

function emailOpcional(v) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) return null;
  if (s.length > 120 || !RE_EMAIL.test(s)) throw err('Correo electrónico inválido.');
  return s;
}

function telefonoOpcional(v) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) return null;
  if (!RE_TELEFONO.test(s)) throw err('Teléfono inválido.');
  return s;
}

function textoOpcional(v, campo, max = 300) {
  const s = limpiar(v);
  if (!s) return null;
  if (s.length > max || !RE_TEXTO.test(s)) throw err(`${campo} contiene caracteres no permitidos o es demasiado largo.`);
  return s;
}

function fecha(v, campo) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw err(`${campo} inválida (formato AAAA-MM-DD).`);
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw err(`${campo} inválida.`);
  return v;
}

// Cantidad de noches entre dos fechas AAAA-MM-DD (entrada 10, salida 13 => 3 noches)
const nochesEntre = (entrada, salida) =>
  Math.round((Date.parse(`${salida}T00:00:00Z`) - Date.parse(`${entrada}T00:00:00Z`)) / 86400000);

const hoyChile = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });

function entero(v, campo, min, max) {
  if (!Number.isInteger(v) || v < min || v > max) throw err(`${campo} debe ser un número entero entre ${min} y ${max}.`);
  return v;
}

function numeroHabitacion(v) {
  const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
  if (!RE_NUMERO_HAB.test(s)) throw err('Número de habitación inválido (letras, números o guion, máximo 10 caracteres).');
  return s;
}

function opcion(v, validas, campo) {
  const s = typeof v === 'string' ? v.trim().toUpperCase() : '';
  if (!validas.includes(s)) throw err(`${campo} inválido. Valores permitidos: ${validas.join(', ')}.`);
  return s;
}

function idParam(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw err('Identificador inválido.');
  return n;
}

module.exports = {
  nombre, rut, calcularDv, username, password, emailOpcional, telefonoOpcional, textoOpcional,
  fecha, hoyChile, nochesEntre, entero, numeroHabitacion, opcion, idParam,
};
