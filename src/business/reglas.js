'use strict';
// Reglas de dominio del hotel en un solo lugar (fáciles de cambiar)

// La capacidad máxima de una habitación depende de su tipo
const CAPACIDAD_POR_TIPO = { SIMPLE: 1, DOBLE: 2, SUITE: 3, FAMILIAR: 4 };
const TIPOS = Object.keys(CAPACIDAD_POR_TIPO);

// Orientación de la habitación: lo que se ve desde la ventana
const ORIENTACIONES = ['VISTA_MAR', 'VISTA_CIUDAD'];

module.exports = { CAPACIDAD_POR_TIPO, TIPOS, ORIENTACIONES };
