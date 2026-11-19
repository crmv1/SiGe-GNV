#!/usr/bin/env node
// ============================================================
//  scripts/cargar-inventario-demo.js
//  Carga productos y movimientos FICTICIOS de un taller GNV,
//  para poder probar la app con datos que parezcan reales.
//
//  --------------------------------------------------------
//  QUE NO HACE, Y NO SE DEBE HACER
//  --------------------------------------------------------
//  No carga cilindros. El cilindro no es un producto del
//  deposito: no hay stock, ni entradas, ni salidas de cilindros.
//  La IA lo recomienda por medida con el catalogo referencial
//  (`CILINDROS_REFERENCIA`) y su precio vive en
//  `parametros_precios`, no en `inventario_productos`.
//
//  El script se niega a correr si alguna tabla o columna de
//  cilindro aparece, para que un dia de estos no se metan datos
//  por la puerta de atras.
//
//  --------------------------------------------------------
//  LOS DATOS SON INVENTADOS
//  --------------------------------------------------------
//  Los precios NO son los de VC Gas. Son redondos y de
//  verosimil para que la demo se vea bien, no para cotizar.
//  Los codigos llevan prefijo `DEMO-` para reconocerlos de un
//  vistazo y borrarlos despues con `--limpiar`.
//
//  --------------------------------------------------------
//  LOS MOVIMIENTOS PASAN POR EL SERVICIO
//  --------------------------------------------------------
//  No se inserta nada con SQL directo. Todo entra por
//  `crearProducto()` y `registrarMovimiento()`, que son los
//  mismos que usa la API. Asi el stock y su historial quedan
//  encadenados y correctos, y el demo se comporta igual que en
//  produccion. Un INSERT a mano dejaria `stock_actual` sin
//  cuadrar con los movimientos, que es justo lo que
//  `verify-database.js` revisa.
//
//  --------------------------------------------------------
//  USO
//  --------------------------------------------------------
//    npm run db:demo              (cargar)
//    npm run db:demo -- --limpiar (borrar SOLO lo demo)
//    npm run db:demo -- --listar  (solo ver que hay)
//
//  En la base de pruebas:
//    .\scripts\con-3307.ps1 scripts\cargar-inventario-demo.js
// ============================================================
import { env } from '../src/config/env.js';
import { query, queryOne, closePool } from '../src/config/database.js';
import {
  crearProducto,
  registrarMovimiento,
  validarProductoBody,
  validarMovimientoBody,
  CATEGORIAS,
} from '../src/modules/inventario/inventario.service.js';

// ------------------------------------------------------------
//  Candado contra la base real
// ------------------------------------------------------------
//  `.env` apunta a 3306, la base DEL TALLER. Cargar productos
//  ficticios ahi por accidente seria un desastre, asi que este
//  script se niega salvo que se pase `--forzar` a proposito.
const PUERTO_REAL = 3306;
const forzar = process.argv.includes('--forzar');

if (Number(env.db.port) === PUERTO_REAL && !forzar) {
  console.error('');
  console.error('  ESTE SCRIPT NO CORRE CONTRA LA BASE REAL.');
  console.error('');
  console.error(`  La conexion apunta a ${env.db.host}:${env.db.port}, que es la base DEL TALLER.`);
  console.error('  Cargar productos ficticios ahi mezclaria datos de demo con los reales.');
  console.error('');
  console.error('  Para la base de pruebas:');
  console.error('    .\\scripts\\con-3307.ps1 scripts\\cargar-inventario-demo.js');
  console.error('');
  console.error('  Si de verdad quieres hacerlo en 3306, tienes que decirlo explicitamente:');
  console.error('    node scripts\\cargar-inventario-demo.js --forzar');
  console.error('');
  process.exit(1);
}

const limpiar = process.argv.includes('--limpiar');
const listar = process.argv.includes('--listar');

// ------------------------------------------------------------
//  Productos
//
//  `precio_compra` y `precio_venta` son inventados. Los de
//  compra rondan el 55-70% del de venta, que es lo normal en
//  repuestos: el margen se lo lleva el taller, no el recargo.
//
//  `stock_minimo` marca el nivel en el que conviene reponer.
//  Los productos de consumo rapido (filtros, cinta, teflon)
//  llevan minimo alto porque se acaban; los de linea pesada
//  (electroválvula, regulador) llevan minimo bajo porque se
//  piden por pedido.
// ------------------------------------------------------------
const PRODUCTOS = [
  // --- Filtrado ---------------------------------------------
  {
    codigo: 'DEMO-FIL-001',
    nombre: 'Filtro de gas GNV (microfibra 12um)',
    descripcion: 'Filtro de gas para inyectores de GNV. Repuesto de recambio estandar.',
    categoria: 'repuesto',
    unidad: 'unidad',
    stock_minimo: 8,
    precio_compra: 85,
    precio_venta: 150,
  },
  {
    codigo: 'DEMO-FIL-002',
    nombre: 'Filtro de aire GNV (elemento de seguridad)',
    descripcion: 'Filtro de aire con elemento de seguridad para la linea de admision.',
    categoria: 'repuesto',
    unidad: 'unidad',
    stock_minimo: 6,
    precio_compra: 110,
    precio_venta: 190,
  },
  {
    codigo: 'DEMO-FIL-003',
    nombre: 'Filtro de gas reforzado (etapa doble)',
    descripcion: 'Filtro de doble etapa para vehiculos de mayor caudal.',
    categoria: 'repuesto',
    unidad: 'unidad',
    stock_minimo: 4,
    precio_compra: 190,
    precio_venta: 320,
  },

  // --- Linea de gas -----------------------------------------
  {
    codigo: 'DEMO-MAN-001',
    nombre: 'Manguera para GNV 3/8" (metro)',
    descripcion: 'Manguera reforzada para linea de gas. Venta por metro.',
    categoria: 'insumo',
    unidad: 'metro',
    stock_minimo: 20,
    precio_compra: 28,
    precio_venta: 50,
  },
  {
    codigo: 'DEMO-MAN-002',
    nombre: 'Manguera de carga 1/4" (metro)',
    descripcion: 'Manguera para el kit de recarga del vehiculo.',
    categoria: 'insumo',
    unidad: 'metro',
    stock_minimo: 15,
    precio_compra: 24,
    precio_venta: 45,
  },
  {
    codigo: 'DEMO-CAN-001',
    nombre: 'Cañería de acero GNV 11 mm (metro)',
    descripcion: 'Cañería para linea de gas, roscada a los extremos.',
    categoria: 'accesorio',
    unidad: 'metro',
    stock_minimo: 10,
    precio_compra: 35,
    precio_venta: 65,
  },
  {
    codigo: 'DEMO-ABR-001',
    nombre: 'Abrazadera metálica 11-16 mm',
    descripcion: 'Abrazadera de acero con tornillo, para fijar la cañería de gas.',
    categoria: 'accesorio',
    unidad: 'unidad',
    stock_minimo: 50,
    precio_compra: 4,
    precio_venta: 9,
  },
  {
    codigo: 'DEMO-ABR-002',
    nombre: 'Abrazadera de manguera 3/8"',
    descripcion: 'Abrazadera con banda para asegurar la manguera sobre el fitting.',
    categoria: 'accesorio',
    unidad: 'unidad',
    stock_minimo: 50,
    precio_compra: 3.5,
    precio_venta: 8,
  },
  {
    codigo: 'DEMO-CON-001',
    nombre: 'Conector macho 3/8" para manguera GNV',
    descripcion: 'Conector de union para manguera de gas, rosca macho.',
    categoria: 'accesorio',
    unidad: 'unidad',
    stock_minimo: 25,
    precio_compra: 22,
    precio_venta: 42,
  },
  {
    codigo: 'DEMO-CON-002',
    nombre: 'Conector hembra 3/8" para manguera GNV',
    descripcion: 'Conector de union para manguera de gas, rosca hembra.',
    categoria: 'accesorio',
    unidad: 'unidad',
    stock_minimo: 25,
    precio_compra: 22,
    precio_venta: 42,
  },
  {
    codigo: 'DEMO-CON-003',
    nombre: 'Conector rapido para valvula de carga',
    descripcion: 'Conector de acoplamiento rapido para la valvula de carga.',
    categoria: 'accesorio',
    unidad: 'unidad',
    stock_minimo: 12,
    precio_compra: 75,
    precio_venta: 130,
  },

  // --- Regulacion y control ---------------------------------
  {
    codigo: 'DEMO-EV-001',
    nombre: 'Electroválvula de gas GNV',
    descripcion: 'Electroválvula de corte de la linea de gas, con bobina de 12 V.',
    categoria: 'repuesto',
    unidad: 'unidad',
    stock_minimo: 3,
    precio_compra: 320,
    precio_venta: 520,
  },
  {
    codigo: 'DEMO-REG-001',
    nombre: 'Regulador de presión GNV (segunda etapa)',
    descripcion: 'Regulador de segunda etapa para reductora de vehiculo.',
    categoria: 'repuesto',
    unidad: 'unidad',
    stock_minimo: 2,
    precio_compra: 480,
    precio_venta: 760,
  },
  {
    codigo: 'DEMO-REG-002',
    nombre: 'Regulador de primera etapa',
    descripcion: 'Regulador de primera etapa, etapa de mayor caudal.',
    categoria: 'repuesto',
    unidad: 'unidad',
    stock_minimo: 2,
    precio_compra: 540,
    precio_venta: 850,
  },
  {
    codigo: 'DEMO-MAN-003',
    nombre: 'Manómetro de presión 0-400 bar',
    descripcion: 'Manometro para medida de presion de la linea de gas.',
    categoria: 'accesorio',
    unidad: 'unidad',
    stock_minimo: 3,
    precio_compra: 95,
    precio_venta: 170,
  },
  {
    codigo: 'DEMO-VLV-001',
    nombre: 'Válvula de carga GNV',
    descripcion: 'Valvula de carga para el puerto de relleno del vehiculo.',
    categoria: 'repuesto',
    unidad: 'unidad',
    stock_minimo: 3,
    precio_compra: 210,
    precio_venta: 350,
  },
  {
    codigo: 'DEMO-SEN-001',
    nombre: 'Sensor de nivel de gas (flotador)',
    descripcion: 'Sensor de nivel del deposito con flotador y señal electrica.',
    categoria: 'repuesto',
    unidad: 'unidad',
    stock_minimo: 4,
    precio_compra: 160,
    precio_venta: 270,
  },
  {
    codigo: 'DEMO-SEN-002',
    nombre: 'Sensor de temperatura de gas',
    descripcion: 'Sensor de temperatura para la linea de admision.',
    categoria: 'repuesto',
    unidad: 'unidad',
    stock_minimo: 4,
    precio_compra: 140,
    precio_venta: 235,
  },
  {
    codigo: 'DEMO-SEN-003',
    nombre: 'Sensor de presión de gas (0-10 bar)',
    descripcion: 'Sensor de presion para el control electronico de inyeccion.',
    categoria: 'repuesto',
    unidad: 'unidad',
    stock_minimo: 4,
    precio_compra: 175,
    precio_venta: 290,
  },

  // --- Electricidad -----------------------------------------
  {
    codigo: 'DEMO-REL-001',
    nombre: 'Relé 12 V con base (30 A)',
    descripcion: 'Rele para el control de electrovalvulas y bombas.',
    categoria: 'repuesto',
    unidad: 'unidad',
    stock_minimo: 10,
    precio_compra: 35,
    precio_venta: 65,
  },
  {
    codigo: 'DEMO-FUS-001',
    nombre: 'Fusible 30 A (caja de 10)',
    descripcion: 'Fusibles de la caja electrica del vehiculo, venta por caja.',
    categoria: 'accesorio',
    unidad: 'caja',
    stock_minimo: 8,
    precio_compra: 28,
    precio_venta: 52,
  },
  {
    codigo: 'DEMO-FUS-002',
    nombre: 'Fusible 15 A (caja de 10)',
    descripcion: 'Fusibles de la caja electrica del vehiculo, venta por caja.',
    categoria: 'accesorio',
    unidad: 'caja',
    stock_minimo: 8,
    precio_compra: 28,
    precio_venta: 52,
  },
  {
    codigo: 'DEMO-FUS-003',
    nombre: 'Portafusible con tapa',
    descripcion: 'Portafusible en linea para instalacion en el tablero.',
    categoria: 'accesorio',
    unidad: 'unidad',
    stock_minimo: 15,
    precio_compra: 8,
    precio_venta: 18,
  },

  // --- Consumibles y limpieza -------------------------------
  {
    codigo: 'DEMO-INS-001',
    nombre: 'Cinta aislante (rollo 20 m)',
    descripcion: 'Cinta aislante para conexiones electricas del kit GNV.',
    categoria: 'insumo',
    unidad: 'rollo',
    stock_minimo: 12,
    precio_compra: 9,
    precio_venta: 20,
  },
  {
    codigo: 'DEMO-INS-002',
    nombre: 'Teflón (cinta de sellado)',
    descripcion: 'Cinta de teflon para sellar roscas de gas y valvulas.',
    categoria: 'insumo',
    unidad: 'rollo',
    stock_minimo: 15,
    precio_compra: 6,
    precio_venta: 14,
  },
  {
    codigo: 'DEMO-INS-003',
    nombre: 'Limpiador de inyectores (aerosol 400 ml)',
    descripcion: 'Aerosol limpiador para inyectores de gas.',
    categoria: 'insumo',
    unidad: 'unidad',
    stock_minimo: 10,
    precio_compra: 48,
    precio_venta: 85,
  },
  {
    codigo: 'DEMO-INS-004',
    nombre: 'Limpiador de valvejas (aerosol 400 ml)',
    descripcion: 'Aerosol limpiador de valvulas de admision.',
    categoria: 'insumo',
    unidad: 'unidad',
    stock_minimo: 8,
    precio_compra: 52,
    precio_venta: 92,
  },
  {
    codigo: 'DEMO-INS-005',
    nombre: 'Lija de agua 400 (pack)',
    descripcion: 'Papel de lija para pulir el sellante de las uniones.',
    categoria: 'insumo',
    unidad: 'pack',
    stock_minimo: 6,
    precio_compra: 14,
    precio_venta: 28,
  },

  // --- Kits y accesorios ------------------------------------
  {
    codigo: 'DEMO-KIT-001',
    nombre: 'Kit de mantenimiento de inyectores',
    descripcion: 'Kit con escobillas, pequeñas herramientas y sellante para inyectores.',
    categoria: 'kit',
    unidad: 'kit',
    stock_minimo: 2,
    precio_compra: 220,
    precio_venta: 390,
  },
  {
    codigo: 'DEMO-KIT-002',
    nombre: 'Kit de conversion GNV (juego completo)',
    descripcion: 'Juego de conversion para vehiculo: cañeria, manguera, conectores, abrazaderas.',
    categoria: 'kit',
    unidad: 'kit',
    stock_minimo: 1,
    precio_compra: 680,
    precio_venta: 1150,
  },
  {
    codigo: 'DEMO-KIT-003',
    nombre: 'Kit electrico GNV',
    descripcion: 'Kit electrico: ECU, relé, fusibles y cableado de control.',
    categoria: 'kit',
    unidad: 'kit',
    stock_minimo: 1,
    precio_compra: 950,
    precio_venta: 1600,
  },
  {
    codigo: 'DEMO-ACE-001',
    nombre: 'Válvula de alivio de seguridad GNV',
    descripcion: 'Válvula de alivio de la linea de gas, pieza de seguridad.',
    categoria: 'accesorio',
    unidad: 'unidad',
    stock_minimo: 3,
    precio_compra: 130,
    precio_venta: 215,
  },
  {
    codigo: 'DEMO-ACE-002',
    nombre: 'Soporte de anclaje para cilindro (par)',
    descripcion: 'Soporte metalico de fijacion. Venta por par.',
    categoria: 'accesorio',
    unidad: 'par',
    stock_minimo: 4,
    precio_compra: 75,
    precio_venta: 130,
  },
  {
    codigo: 'DEMO-ACE-003',
    nombre: 'Collarín de protección para cañería',
    descripcion: 'Collarín de protección contra roce en los puntos de paso.',
    categoria: 'accesorio',
    unidad: 'unidad',
    stock_minimo: 25,
    precio_compra: 7,
    precio_venta: 16,
  },
  {
    codigo: 'DEMO-ACE-004',
    nombre: 'Rotulo de inspección GNV (blanco)',
    descripcion: 'Rotulo adhesivo con la fecha de recalificación.',
    categoria: 'insumo',
    unidad: 'unidad',
    stock_minimo: 40,
    precio_compra: 3,
    precio_venta: 8,
  },
  {
    codigo: 'DEMO-OTR-001',
    nombre: 'Terminal de compresion M6 (caja de 50)',
    descripcion: 'Terminales para el cableado de potencia del kit.',
    categoria: 'accesorio',
    unidad: 'caja',
    stock_minimo: 6,
    precio_compra: 22,
    precio_venta: 44,
  },
  {
    codigo: 'DEMO-OTR-002',
    nombre: 'Cable tripolar 2.5 mm (metro)',
    descripcion: 'Cable tripolar para alimentacion de electrovalvulas.',
    categoria: 'insumo',
    unidad: 'metro',
    stock_minimo: 25,
    precio_compra: 12,
    precio_venta: 24,
  },
  {
    codigo: 'DEMO-OTR-003',
    nombre: 'Adhesivo anaeróbico (tubo 50 ml)',
    descripcion: 'Pegamento anaeróbico para fijaciones roscadas.',
    categoria: 'insumo',
    unidad: 'tube',
    stock_minimo: 8,
    precio_compra: 38,
    precio_venta: 68,
  },
  {
    codigo: 'DEMO-OTR-004',
    nombre: 'Sellante de gas (tubo 60 ml)',
    descripcion: 'Sellante de silicona para uniones de linea de gas.',
    categoria: 'insumo',
    unidad: 'tube',
    stock_minimo: 8,
    precio_compra: 26,
    precio_venta: 48,
  },
  {
    codigo: 'DEMO-OTR-005',
    nombre: 'Protector de borde de cañería',
    descripcion: 'Protector plastico para el borde del corte de la cañería.',
    categoria: 'accesorio',
    unidad: 'unidad',
    stock_minimo: 30,
    precio_compra: 4,
    precio_venta: 11,
  },
];

// ------------------------------------------------------------
//  Movimientos
//
//  Se arman de forma deterministica (indice, no Math.random) y
//  en orden cronologico, para que el demo se vea siempre igual y
//  el stock cuadre. Las fechas se reparten hacia atras desde
//  hoy.
//
//  El ultimo movimiento de cada producto deja el stock en el
//  valor de `stock_final` de abajo, que es el que se ve en la
//  app. Un ajuste final es lo que hace cuadrar la cuenta sin
//  tener que simular dozens de salidas.
// ------------------------------------------------------------
const stockFinal = {
  'DEMO-FIL-001': 14,
  'DEMO-FIL-002': 9,
  'DEMO-FIL-003': 3,
  'DEMO-MAN-001': 65,
  'DEMO-MAN-002': 40,
  'DEMO-CAN-001': 28,
  'DEMO-ABR-001': 120,
  'DEMO-ABR-002': 95,
  'DEMO-CON-001': 40,
  'DEMO-CON-002': 38,
  'DEMO-CON-003': 7,
  'DEMO-EV-001': 5,
  'DEMO-REG-001': 4,
  'DEMO-REG-002': 2,
  'DEMO-MAN-003': 6,
  'DEMO-VLV-001': 5,
  'DEMO-SEN-001': 8,
  'DEMO-SEN-002': 7,
  'DEMO-SEN-003': 6,
  'DEMO-REL-001': 24,
  'DEMO-FUS-001': 11,
  'DEMO-FUS-002': 9,
  'DEMO-FUS-003': 22,
  'DEMO-INS-001': 16,
  'DEMO-INS-002': 19,
  'DEMO-INS-003': 13,
  'DEMO-INS-004': 5,
  'DEMO-INS-005': 7,
  'DEMO-KIT-001': 4,
  'DEMO-KIT-002': 2,
  'DEMO-KIT-003': 1,
  'DEMO-ACE-001': 6,
  'DEMO-ACE-002': 9,
  'DEMO-ACE-003': 31,
  'DEMO-ACE-004': 120,
  'DEMO-OTR-001': 8,
  'DEMO-OTR-002': 45,
  'DEMO-OTR-003': 6,
  'DEMO-OTR-004': 9,
  'DEMO-OTR-005': 44,
};

/**
 * Plan de movimientos por producto.
 *
 * Devuelve los movimientos YA EN ORDEN CRONOLOGICO, del mas
 * antiguo al mas reciente. El orden importa: `stock` se calcula
 * aqui y cada movimiento se aplica con `FOR UPDATE` leyendo el
 * stock real, asi que si la lista no estuviera en orden de
 * fecha, el ultimo movimiento no dejaria el stock en
 * `stockFinal`.
 *
 * Por eso `diasAtras` no se escribe a mano en cada bloque, sino
 * que sale de un reloj que solo corre hacia atras: cada
 * movimiento se lleva un salto de 2 a 5 dias. Asi es imposible
 * que un movimiento generado despues termine con una fecha
 * anterior a uno generado antes.
 */
function planMovimientos(codigo) {
  const final = stockFinal[codigo];

  // Semilla estable a partir del codigo: el mismo producto da
  // siempre los mismos numeros, sin azar.
  let semilla = 0;
  for (const ch of codigo) semilla = (semilla * 31 + ch.charCodeAt(0)) % 997;
  const azar = () => {
    semilla = (semilla * 1103515245 + 12345) % 2147483648;
    return semilla / 2147483648;
  };

  // El reloj de fechas. Arranca hace 55 dias y nunca vuelve
  // atras, con un piso de 8 dias para que el movimiento de
  // cierre (que va a 6) siga siendo el mas reciente.
  let dias = 55;
  const siguienteDia = () => {
    dias = Math.max(8, dias - (2 + Math.floor(azar() * 4)));
    return dias;
  };

  const movimientos = [];

  // 1-2 entradas de compra. Siempre antes que cualquier salida,
  //    porque no se puede retirar lo que no entro.
  const compras = 1 + Math.floor(azar() * 2);
  let stock = 0;

  for (let i = 0; i < compras; i += 1) {
    const cantidad = 6 + Math.floor(azar() * 25);
    movimientos.push({
      tipo: 'ENTRADA',
      cantidad,
      diasAtras: siguienteDia(),
      motivo: i === 0 ? 'Compra a proveedor' : 'Reposicion de stock',
      referencia: `FAC-${1000 + Math.floor(azar() * 8999)}`,
    });
    stock += cantidad;
  }

  // 2-4 salidas por venta a vehiculos. Nunca mas de lo que hay:
  //  si no queda stock, esa salida no se genera, porque el
  //  servicio rechazaria una salida que dejara el deposito en
  //  negativo.
  const ventas = 2 + Math.floor(azar() * 3);
  for (let i = 0; i < ventas; i += 1) {
    if (stock <= 0) break;

    const maximo = Math.max(1, Math.min(stock, Math.floor(stock * 0.35) || 1));
    const cantidad = 1 + Math.floor(azar() * maximo);
    if (cantidad > stock) continue;

    movimientos.push({
      tipo: 'SALIDA',
      cantidad,
      diasAtras: siguienteDia(),
      motivo: 'Consumo en taller',
      referencia: `OT-${2000 + Math.floor(azar() * 7999)}`,
    });
    stock -= cantidad;
  }

  // Un ajuste de inventario fisico a mitad de camino. Puede
  // ser a favor o en contra, como en la vida real.
  if (azar() > 0.45) {
    const delta = (azar() > 0.5 ? 1 : -1) * (1 + Math.floor(azar() * 3));
    const nuevo = Math.max(0, stock + delta);
    if (nuevo !== stock) {
      movimientos.push({
        tipo: 'AJUSTE',
        stockNuevo: nuevo,
        diasAtras: siguienteDia(),
        motivo: delta > 0 ? 'Diferencia de conteo fisico' : 'Merma por dano en el deposito',
        referencia: null,
      });
      stock = nuevo;
    }
  }

  // El ultimo movimiento deja el stock en el valor final, para
  // que el demo muestre una foto coherente del deposito sin
  // tener que simular un ano entero de ventas.
  //
  //  Si falta, se compra (ENTRADA). Si sobra, NO se puede cerrar
  //  con una ENTRADA porque eso SUMARIA: hace falta un AJUSTE
  //  hacia abajo, que es ademas lo que se hace en un deposito de
  //  verdad cuando sobra material.
  if (final !== stock) {
    if (final > stock) {
      movimientos.push({
        tipo: 'ENTRADA',
        cantidad: final - stock,
        diasAtras: siguienteDia(),
        motivo: 'Compra a proveedor',
        referencia: `FAC-${1000 + Math.floor(azar() * 8999)}`,
      });
    } else {
      movimientos.push({
        tipo: 'AJUSTE',
        stockNuevo: final,
        diasAtras: siguienteDia(),
        motivo: 'Ajuste de cierre de inventario',
        referencia: null,
      });
    }
  }

  // La lista YA viene en orden cronologico, del mas antiguo al
  // mas reciente, porque el reloj `siguienteDia` solo corre hacia
  // atras. No se reordena aqui a proposito: si se hiciera, el
  // ultimo movimiento en aplicar dejaria el stock en un valor
  // distinto de `stockFinal` y el deposito no cuadraria.
  //
  //  Solo se limpian los movimientos de cantidad cero, que el
  //  servicio rechazaria.
  const plan = movimientos.filter((m) => (m.tipo === 'AJUSTE' ? true : m.cantidad > 0));

  // El ultimo se pega a la fecha actual: en el panel del taller
  // lo primero que se mira es si hubo movimiento hoy o hace
  // poco, y con el reloj de arriba el mas reciente se quedaba
  // unas dos semanas atras. Solo se toca ESTE, que ya era el
  // menor: bajarlo no rompe el orden.
  if (plan.length > 0) {
    plan[plan.length - 1].diasAtras = 2;
  }

  return plan;
}

const DIAS = (diasAtras) => {
  const d = new Date();
  d.setDate(d.getDate() - diasAtras);
  return d;
};

// ------------------------------------------------------------
//  Comprobaciones previas
// ------------------------------------------------------------
async function verificarSinCilindros() {
  const tablas = await query(
    `SELECT TABLE_NAME AS tabla FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cilindros'`
  );

  const columnas = await query(
    `SELECT TABLE_NAME AS tabla, COLUMN_NAME AS columna
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND ((TABLE_NAME = 'vehiculos' AND COLUMN_NAME = 'id_cilindro')
          OR (TABLE_NAME = 'inventario_productos'
                AND COLUMN_NAME IN ('capacidad_litros', 'montaje')))`
  );

  if (tablas.length > 0 || columnas.length > 0) {
    console.error('');
    console.error('  LA BASE TIENE ESTRUCTURAS DE CILINDRO.');
    console.error('');
    for (const t of tablas) console.error(`    tabla ${t.tabla}`);
    for (const c of columnas) console.error(`    columna ${c.tabla}.${c.columna}`);
    console.error('');
    console.error('  Aplica primero database/migrations/011_retirar_cilindros.sql.');
    console.error('  Este script no carga datos si el cilindro todavia existe como entidad.');
    console.error('');
    process.exit(1);
  }
}

/** Usuario que se hace cargo de los movimientos del demo. */
async function usuarioDemo() {
  const porRol = await query(
    `SELECT id, username, rol FROM usuarios
      WHERE rol IN ('administrador', 'tecnico') AND estado = 'activo'
      ORDER BY FIELD(rol, 'administrador', 'tecnico'), id
      LIMIT 5`
  );

  if (porRol.length === 0) {
    console.error('');
    console.error('  No hay ningun administrador o tecnico activo para cargar los movimientos.');
    console.error('  Los movimientos necesitan un id_usuario: la columna no admite NULL.');
    console.error('');
    process.exit(1);
  }

  return porRol[0];
}

// ------------------------------------------------------------
//  Cargar
// ------------------------------------------------------------
async function cargar() {
  await verificarSinCilindros();

  const usuario = await usuarioDemo();
  console.log('');
  console.log(`  Movimientos a nombre de: ${usuario.username} (${usuario.rol})`);
  console.log('');

  // Si ya hay productos demo, se quitan antes. Volver a correr
  // el script tiene que dar el mismo resultado, no duplicar.
  const { borrados } = await borrar({ silencioso: true });

  const yaExistentes = PRODUCTOS.filter((p) => !CATEGORIAS.includes(p.categoria));
  if (yaExistentes.length > 0) {
    console.error('');
    console.error('  Hay productos con una categoria que el servicio no acepta:');
    for (const p of yaExistentes) {
      console.error(`    ${p.codigo} -> "${p.categoria}"`);
    }
    console.error(`  Validas: ${CATEGORIAS.join(', ')}`);
    console.error('');
    process.exit(1);
  }

  const porCategoria = new Map();
  let creados = 0;
  const ids = new Map();

  for (const p of PRODUCTOS) {
    // `crearProducto` NO normaliza: espera el cuerpo ya pasado
    // por `validarProductoBody`, que es lo que hace el controller
    // de la API. Sin ese paso los campos llegan en snake_case y
    // el servicio no los ve.
    const cuerpo = validarProductoBody({ ...p, estado: 'activo', stock_inicial: 0 });

    // `crearProducto` devuelve el id plano, no el objeto.
    const idProducto = await crearProducto(cuerpo, { id_usuario: usuario.id });

    ids.set(p.codigo, idProducto);
    creados += 1;

    porCategoria.set(p.categoria, (porCategoria.get(p.categoria) ?? 0) + 1);
  }

  console.log(`  Productos creados: ${creados}`);
  for (const [cat, n] of [...porCategoria].sort()) {
    console.log(`    ${cat.padEnd(12)} ${n}`);
  }
  console.log('');

  // Movimientos. Van por el servicio, uno a uno, para que el
  // stock y el historial queden encadenados.
  let entradas = 0;
  let salidas = 0;
  let ajustes = 0;
  const fechasMin = [];

  for (const p of PRODUCTOS) {
    const idProducto = ids.get(p.codigo);
    const plan = planMovimientos(p.codigo);

    for (const m of plan) {
      const fecha = DIAS(m.diasAtras);

      // Igual que con los productos: el cuerpo del movimiento
      // pasa por `validarMovimientoBody` antes de llegar al
      // servicio. Un AJUSTE lleva `stock_nuevo` y no `cantidad`;
      // el servicio calcula la diferencia.
      const cuerpo = validarMovimientoBody({
        tipo: m.tipo,
        cantidad: m.cantidad ?? undefined,
        stock_nuevo: m.stockNuevo ?? undefined,
        motivo: m.motivo,
        referencia: m.referencia ?? undefined,
      });

      const mov = await registrarMovimiento(
        { idProducto, ...cuerpo },
        { id_usuario: usuario.id }
      );

      // La fecha se corrige despues con un UPDATE porque el
      // servicio la pone en CURRENT_TIMESTAMP y el demo quiere
      // un historial repartido en el tiempo. Solo se toca la
      // columna `fecha`, que el servicio no usa para calcular
      // nada: el stock ya quedo escrito en su propia transaccion.
      await query('UPDATE movimientos_inventario SET fecha = ? WHERE id_movimiento = ?', [
        fecha,
        mov.idMovimiento,
      ]);

      fechasMin.push(fecha);

      if (m.tipo === 'ENTRADA') entradas += 1;
      else if (m.tipo === 'SALIDA') salidas += 1;
      else ajustes += 1;
    }
  }

  const desde = new Date(Math.min(...fechasMin));
  const hasta = new Date(Math.max(...fechasMin));

  console.log('  Movimientos creados');
  console.log(`    entradas : ${entradas}`);
  console.log(`    salidas  : ${salidas}`);
  console.log(`    ajustes  : ${ajustes}`);
  console.log(`    total    : ${entradas + salidas + ajustes}`);
  console.log('');
  console.log(
    `    fechas   : ${desde.toLocaleDateString('es-BO')} a ${hasta.toLocaleDateString('es-BO')}`
  );
  console.log('');

  // El punto de todo esto: la cuenta tiene que cerrar. Si el
  // historial no cuadra con el stock, `verify-database.js` va a
  // avisar, y con razon.
  const descuadres = await query(
    `SELECT COUNT(*) AS n
       FROM inventario_productos p
      WHERE p.codigo LIKE 'DEMO-%'
        AND p.stock_actual <> COALESCE((
              SELECT SUM(
                CASE m.tipo
                  WHEN 'ENTRADA' THEN  m.cantidad
                  WHEN 'SALIDA'  THEN -m.cantidad
                  ELSE (m.stock_nuevo - m.stock_anterior)
                END)
                FROM movimientos_inventario m
               WHERE m.id_producto = p.id_producto
            ), 0)`
  );

  // Y ademas que cada producto haya llegado AL valor final que
  // pedia `stockFinal`. La comprobacion de arriba no lo cubre:
  // el historial puede cuadrar perfectamente y aun asi el stock
  // no ser el que se queria (si el orden de los movimientos no
  // fuera el cronologico, por ejemplo).
  const stocks = await query(
    `SELECT codigo, stock_actual FROM inventario_productos WHERE codigo LIKE 'DEMO-%'`
  );

  const fueraDeRango = stocks.filter((p) => Number(p.stock_actual) !== stockFinal[p.codigo]);

  const stockTotal = await queryOne(
    "SELECT COALESCE(SUM(stock_actual), 0) AS n FROM inventario_productos WHERE codigo LIKE 'DEMO-%'"
  );

  console.log(`  Unidades en el deposito : ${stockTotal.n}`);
  console.log(`  Productos que no cuadran: ${descuadres[0].n} (deben ser 0)`);
  console.log(`  Productos fuera del valor final: ${fueraDeRango.length} (deben ser 0)`);

  if (descuadres[0].n > 0 || fueraDeRango.length > 0) {
    console.error('');
    console.error('  La carga NO cierra. No se da por buena.');
    for (const p of fueraDeRango) {
      console.error(
        `    ${p.codigo}: quedo en ${p.stock_actual}, se esperaba ${stockFinal[p.codigo]}`
      );
    }
    console.error('');
    process.exit(1);
  }

  if (borrados > 0) {
    console.log('');
    console.log(`  Se reemplazaron ${borrados} producto(s) demo de una carga anterior.`);
  }

  console.log('');
  console.log('  [OK] Datos de demo cargados.');
  console.log('');
  console.log('  Para verlos:      npm start  ->  http://localhost:5173  ->  Inventario');
  console.log('  Para comprobarlos: npm run db:verify');
  console.log('  Para quitarlos:   npm run db:demo -- --limpiar');
  console.log('');
}

// ------------------------------------------------------------
//  Borrar
//
//  Solo toca lo que lleva el prefijo `DEMO-`. Un producto real
//  del taller no se puede borrar por accidente, porque no
//  lleva ese prefijo.
// ------------------------------------------------------------
async function borrar({ silencioso = false } = {}) {
  const productos = await query(
    "SELECT id_producto FROM inventario_productos WHERE codigo LIKE 'DEMO-%'"
  );

  if (productos.length === 0) {
    if (!silencioso) {
      console.log('');
      console.log('  No hay productos demo que borrar.');
      console.log('');
    }
    return { borrados: 0, movimientos: 0 };
  }

  const ids = productos.map((p) => p.id_producto);
  const marcas = ids.map(() => '?').join(', ');

  // Los movimientos van primero: la FK es ON DELETE RESTRICT.
  const movs = await query(
    `DELETE FROM movimientos_inventario WHERE id_producto IN (${marcas})`,
    ids
  );
  const prods = await query(
    `DELETE FROM inventario_productos WHERE id_producto IN (${marcas})`,
    ids
  );

  if (!silencioso) {
    console.log('');
    console.log(`  Productos demo borrados  : ${prods.affectedRows}`);
    console.log(`  Movimientos demo borrados: ${movs.affectedRows}`);
    console.log('');
    console.log('  Solo se borro lo que empieza con DEMO-. Nada del taller.');
    console.log('');
  }

  return { borrados: prods.affectedRows, movimientos: movs.affectedRows };
}

// ------------------------------------------------------------
//  Listar
// ------------------------------------------------------------
async function mostrar() {
  const productos = await query(
    `SELECT codigo, nombre, categoria, unidad, stock_actual,
            stock_minimo, precio_compra, precio_venta, estado
       FROM inventario_productos
      WHERE codigo LIKE 'DEMO-%'
      ORDER BY categoria, codigo`
  );

  if (productos.length === 0) {
    console.log('');
    console.log('  No hay productos demo cargados.');
    console.log('');
    return;
  }

  console.log('');
  console.log(`  ${productos.length} productos demo`);
  console.log('  ' + '-'.repeat(78));
  console.log(
    `  ${'codigo'.padEnd(14)}${'categoria'.padEnd(12)}${'stock'.padStart(7)}${'min'.padStart(5)}  ${'nombre'.slice(0, 38)}`
  );
  console.log('  ' + '-'.repeat(78));

  let unidades = 0;
  for (const p of productos) {
    unidades += Number(p.stock_actual);
    const bajo = Number(p.stock_actual) <= Number(p.stock_minimo) ? ' *' : '';
    console.log(
      `  ${p.codigo.padEnd(14)}${p.categoria.padEnd(12)}` +
        `${String(p.stock_actual).padStart(7)}${String(p.stock_minimo).padStart(5)}  ` +
        `${String(p.nombre).slice(0, 38)}${bajo}`
    );
  }

  const movs = await queryOne(
    `SELECT COUNT(*) AS n FROM movimientos_inventario m
      JOIN inventario_productos p ON p.id_producto = m.id_producto
     WHERE p.codigo LIKE 'DEMO-%'`
  );

  const porTipo = await query(
    `SELECT m.tipo, COUNT(*) AS n
       FROM movimientos_inventario m
       JOIN inventario_productos p ON p.id_producto = m.id_producto
      WHERE p.codigo LIKE 'DEMO-%'
      GROUP BY m.tipo`
  );

  console.log('  ' + '-'.repeat(78));
  console.log(`  unidades en deposito: ${unidades}`);
  console.log(`  movimientos         : ${movs.n}`);
  for (const t of porTipo) console.log(`    ${t.tipo.padEnd(8)} ${t.n}`);
  console.log('');
  console.log('  * por debajo o en el minimo (sale en la alerta de stock)');
  console.log('');
}

// ------------------------------------------------------------
const correr = limpiar ? borrar() : listar ? mostrar() : cargar();

correr
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('');
    console.error(`  Error al cargar el demo: ${error.code || error.name} - ${error.message}`);
    console.error('');
    await closePool().catch(() => {});
    process.exit(1);
  });
