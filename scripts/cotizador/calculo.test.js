import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calcular } from '../../src/modules/cotizador/calculo.js';

test('Precios VC Gas: tercera + 40 L y quinta + 100 L', () => {
  assert.equal(calcular('4300.00','4200.00','separado').total,8500);
  assert.equal(calcular('6100.00','7200.00','separado').total,13300);
});

test('La modalidad incluida conserva el precio comercial sin cobrarlo dos veces', () => {
  assert.deepEqual(calcular('6100.00','7200.00','kit_incluye_cilindro'), {
    kit:6100, cilindro:0, precio_catalogo_cilindro:7200, total:6100, modalidad:'kit_incluye_cilindro',
  });
});

test('Importes decimales se suman en centavos', () => {
  assert.equal(calcular('0.10','0.20','separado').total,0.3);
});
