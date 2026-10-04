// ============================================================
//  src/ai/vehicleRecognition/vehicleRecognition.service.js
//
//  ARQUITECTURA PREPARADA, NO IMPLEMENTADA.
//
//  Cuando entregues el repositorio/modelo definitivo, este es el
//  unico archivo que hay que modificar: el controlador y la ruta
//  ya no cambian.
//
//  Lo que falta de tu lado:
//    - URL exacta del repositorio
//    - licencia
//    - modelo utilizado
//    - clases disponibles
//    - formato de entrada
//    - formato de salida
//    - pesos entrenados
//    - requisitos tecnicos
//
//  Mientras tanto, este modulo devuelve un MOCK. El mock jamas
//  se presenta como una prediccion real: la respuesta indica
//  explicitamente que el modulo no esta habilitado, para que
//  ningun encargado tome una decision sobre datos falsos.
//
//  REGLA: la IA no decide. El encargado del taller siempre
//  confirma o corrige marca y modelo antes de guardarlo.
//
//  ------------------------------------------------------------
//  LO QUE NO VIVE EN ESTE ARCHIVO, Y POR QUE
//  ------------------------------------------------------------
//  Ni el inventario, ni el stock, ni ningun precio.
//
//  Hubo dos versiones anteriores de este modulo y las dos
//  estaban mal:
//
//  1) La primera traia una tabla de 4 cilindros con sus PRECIOS
//     escritos a mano en el .js. Era un precio que nadie
//     revisaba y que se desactualizaba solo.
//
//  2) La segunda leyo el catalogo de `inventario_productos`
//     con `categoria = 'cilindro'`, y con el `stock_actual` de
//     cada fila. Parecia mejor, pero mezclaba dos cosas que no
//     tienen relacion: lo que el taller VENDE y lo que el
//     taller TIENE.
//
//     Un cilindro que no esta en el deposito igual se puede
//     cotizar: llega el pedido, se compra y se instala. Y al
//     reves, tener 3 cilindros en stock no dice nada sobre si
//     entran en la maletera de un auto. Ademas hacia que el
//     cliente viera un "no disponible" que el sistema no tiene
//     forma de cumplir, porque no existe ninguna orden de
//     compra.
//
//  Ahora el modulo es INDEPENDIENTE del deposito:
//
//    - que cilindro cabe   -> dato FISICO de referencia, en
//                              `CILINDROS_REFERENCIA` (abajo).
//    - cuanto cuesta       -> `parametros_precios`, que carga
//                              el administrador del taller.
//
//  La recomendacion es la misma con 0 o con 500 cilindros en el
//  deposito. El taller puede no tener el que el cliente necesita
//  y eso no cambia el calculo: solo cambia si puede
//  materializarlo, y eso es una decision de compra, no de IA.
//
//  El unico modulo que se lee es `parametros_precios`, y solo
//  para traer PRECIOS. Nunca `inventario_productos`.
// ============================================================
import { obtenerPrecioParametro } from '../../modules/inventario/inventario.service.js';

/** Clave por defecto del parametro de precio con la mano de obra. */
export const CLAVE_PRECIO_INSTALACION = 'instalacion_gnv';

/**
 * Clave que se consulta en `parametros_precios`.
 *
 * Se lee en cada llamada y no al cargar el modulo, para que las
 * pruebas puedan apuntar a su propia clave sin pisar la del
 * taller.
 */
export function clavePrecioInstalacion() {
  return String(process.env.AI_PRECIO_INSTALACION_CLAVE || CLAVE_PRECIO_INSTALACION)
    .trim()
    .toLowerCase();
}

/** Prefijo por defecto de las claves de precio de cada capacidad. */
export const PREFIJO_PRECIO_CILINDRO = 'cilindro_';

/**
 * Clave de precio de un cilindro de cierta capacidad.
 *
 * `40` -> `cilindro_40`. En `parametros_precios` el taller carga
 * una fila por capacidad que vende.
 */
export function clavePrecioCilindro(capacidad_litros) {
  const capacidad = Number(capacidad_litros);

  if (!Number.isInteger(capacidad) || capacidad <= 0) {
    return null;
  }

  const prefijo = String(
    process.env.AI_PRECIO_CILINDRO_PREFIJO || PREFIJO_PRECIO_CILINDRO
  )
    .trim()
    .toLowerCase();

  return `${prefijo}${capacidad}`;
}

/** Clases de ejemplo. Se reemplazan por las del modelo real. */
const CLASES_MOCK = [
  { marca: 'Toyota', modelo: 'Corolla' },
  { marca: 'Toyota', modelo: 'Hilux' },
  { marca: 'Volkswagen', modelo: 'Gol' },
  { marca: 'Chevrolet', modelo: 'Corsa' },
  { marca: 'Nissan', modelo: 'March' },
  { marca: 'Hyundai', modelo: 'Tucson' },
];

/**
 * Vistas de maletera de ejemplo, a confirmar con datos reales de
 * VC Gas.
 *
 * Son MEDIDAS de vehiculo, no precios ni stock: no cambian con
 * el deposito ni con la lista del taller, asi que todavia van
 * aqui. Cuando VC Gas entregue la tabla definitiva, este objeto
 * se reemplaza por una consulta, igual que los cilindros.
 */
const MALETERAS_MOCK = {
  Toyota: { volumen_litros: 380, profundidad_cm: 90, ancho_cm: 105 },
  Volkswagen: { volumen_litros: 300, profundidad_cm: 85, ancho_cm: 98 },
  Chevrolet: { volumen_litros: 280, profundidad_cm: 82, ancho_cm: 96 },
  Nissan: { volumen_litros: 295, profundidad_cm: 84, ancho_cm: 99 },
  Hyundai: { volumen_litros: 585, profundidad_cm: 105, ancho_cm: 135 },
};

/**
 * Catalogo REFERENCIAL de cilindros GNV.
 *
 * No son productos del taller: son medidas de mercado. Por eso
 * viven aqui y no en `inventario_productos`:
 *
 *    - el taller puede no vender una capacidad y aun asi la
 *      IA debe poder razonar sobre ella;
 *    - una medida fisica no cambia por tener o no stock;
 *    - guardar un cilindro como producto obligaria a inventariar
 *      series, capacidades y stock, que es exactamente lo que
 *      NO se quiere manejar.
 *
 * `volumen_minimo_litros` es el espacio REAL que ocupa el
 * equipo en la maletera, incluido el crisol y el soporte. No es
 * la capacidad del gas: por eso un 40 L necesita unos 110 L de
 * hueco, no 40. Comparar capacidad contra volumen de maletera
 * (lo que hacia la version anterior) daba numeros sin sentido.
 *
 * A CONFIRMAR con el supervisor del taller. Mismas salvedades
 * que `MALETERAS_MOCK`: son valores de referencia, no medidas
 * garantizadas de un vehiculo concreto.
 */
const CILINDROS_REFERENCIA = [
  { capacidad_litros: 10, montaje: 'cajuela', volumen_minimo_litros: 30, peso_kg: 22 },
  { capacidad_litros: 12, montaje: 'cajuela', volumen_minimo_litros: 35, peso_kg: 26 },
  { capacidad_litros: 15, montaje: 'cajuela', volumen_minimo_litros: 45, peso_kg: 30 },
  { capacidad_litros: 18, montaje: 'maletero', volumen_minimo_litros: 55, peso_kg: 36 },
  { capacidad_litros: 20, montaje: 'maletero', volumen_minimo_litros: 60, peso_kg: 40 },
  { capacidad_litros: 24, montaje: 'maletero', volumen_minimo_litros: 70, peso_kg: 46 },
  { capacidad_litros: 30, montaje: 'maletero', volumen_minimo_litros: 85, peso_kg: 55 },
  { capacidad_litros: 35, montaje: 'maletero', volumen_minimo_litros: 95, peso_kg: 60 },
  { capacidad_litros: 40, montaje: 'maletero', volumen_minimo_litros: 110, peso_kg: 68 },
  { capacidad_litros: 45, montaje: 'maletero', volumen_minimo_litros: 120, peso_kg: 75 },
  { capacidad_litros: 50, montaje: 'maletero', volumen_minimo_litros: 135, peso_kg: 82 },
  { capacidad_litros: 60, montaje: 'trasero', volumen_minimo_litros: 160, peso_kg: 95 },
];

/** Todas las medidas referenciales, sin tocar la base. */
export function listarCilindrosReferencia() {
  return CILINDROS_REFERENCIA.map((c) => ({ ...c }));
}

/**
 * Prediccion de marca y modelo a partir de la imagen.
 *
 * @param {object} archivo  Resultado de multer: { mimetype, size, buffer }
 * @returns {Promise<object>} Respuesta con la prediccion o el estado del mock.
 */
export async function predecirVehiculo(archivo) {
  const habilitado = process.env.AI_VEHICLE_RECOGNITION_ENABLED === 'true';

  if (!habilitado) {
    return {
      success: true,
      mock: true,
      mensaje:
        'El modulo de reconocimiento no esta habilitado todavia. ' +
        'Ingresa marca y modelo manualmente.',
      data: null,
    };
  }

  // --- Cuando exista el modelo real, la prediccion va aqui ---
  //   const tensor = preprocesar(archivo.buffer);
  //   const salida = await modelo.predict(tensor);
  //   return mapearSalida(salida);

  // eslint-disable-next-line no-unreachable
  return predecirMock(archivo);
}

/** Prediccion falsa, solo para desarrollo. No se usa en produccion. */
function predecirMock(_archivo) {
  const clase = CLASES_MOCK[Math.floor(Math.random() * CLASES_MOCK.length)];

  return {
    success: true,
    mock: true,
    mensaje: 'Prediccion de ejemplo. Confirmala o corregila antes de continuar.',
    data: {
      marca: clase.marca,
      modelo: clase.modelo,
      confidence: Number((0.6 + Math.random() * 0.35).toFixed(2)),
      requiere_confirmacion_humana: true,
    },
  };
}

/**
 * Informacion referencial de la maletera para una marca/modelo.
 * El supervisor del taller valida estos datos.
 */
export function consultarMaletera(marca, modelo) {
  const clave = String(marca ?? '').trim();
  const referencia = MALETERAS_MOCK[clave] ?? null;

  return {
    success: true,
    referencial: true,
    mensaje:
      'Informacion referencial de maletera. Confirmala con medicion real antes de decidir.',
    data: referencia
      ? { marca: clave, modelo: String(modelo ?? '').trim(), ...referencia }
      : null,
  };
}

/**
 * Cilindros que, segun medida, caben en una maletera de
 * `volumen_litros`.
 *
 * El catalogo es referencial y esta en este archivo. NO se
 * consulta `inventario_productos`, ni el stock, ni la
 * disponibilidad: la respuesta es la MISMA con el deposito
 * vacio o lleno. Es una medida fisica, no una promesa de
 * entrega.
 *
 * Con volumen 0 no se filtra: sin medir no se puede afirmar que
 * algo no entra, asi que se devuelve el catalogo completo y se
 * avisa.
 *
 * @param {object} params
 * @param {number} params.volumen_litros  0 = sin dato de maletera.
 */
export function consultarCilindros({ volumen_litros = 0 } = {}) {
  const volumen = Number(volumen_litros) || 0;

  const cilindros = (volumen > 0
    ? CILINDROS_REFERENCIA.filter((c) => c.volumen_minimo_litros <= volumen)
    : CILINDROS_REFERENCIA
  ).map((c) => ({
    ...c,
    // Explicito para el frontend: esto NO dice si hay stock.
    requiere_compra_externa: true,
  }));

  return {
    success: true,
    origen: 'referencial',
    // Se deja explicito que el precio no viene aqui.
    mensaje:
      'Catalogo referencial de cilindros GNV segun volumen de maletera. ' +
      'Es una medida de referencia, no una disponibilidad de stock.',
    advertencia:
      volumen > 0
        ? null
        : 'No se recibio el volumen de la maletera. Faltan mediciones reales.',
    data: cilindros,
  };
}

/**
 * Estimacion referencial de costo. NO es un presupuesto.
 *
 * Los dos precios salen de `parametros_precios`:
 *    - el cilindro, por capacidad (`cilindro_40`);
 *    - la mano de obra, de `instalacion_gnv`.
 *
 * NO se lee `inventario_productos` ni el stock. Que el taller
 * tenga o no el cilindro hoy no cambia el precio de referencia.
 *
 * Si falta alguno de los dos, NO se inventa ni se completa con
 * cero: se devuelve `faltan` para que la pantalla diga que el
 * taller todavia no cargo ese precio. Un 0 silencioso se lee
 * como "es gratis".
 *
 * @param {object} params
 * @param {number} params.capacidad_litros  Capacidad del cilindro.
 * @param {number} params.cantidad          Cuantos, para el subtotal.
 */
export async function estimarCosto({ capacidad_litros = null, cantidad = 1 } = {}) {
  const unidades = Math.max(1, Number(cantidad) || 1);
  const capacidad = Number(capacidad_litros);

  const faltan = [];

  // 1) El cilindro, por precio de capacidad.
  const claveCilindro = clavePrecioCilindro(capacidad);
  let precioCilindro = null;
  let referencia = null;

  if (claveCilindro === null) {
    faltan.push('No se indico una capacidad de cilindro valida.');
  } else {
    referencia = CILINDROS_REFERENCIA.find((c) => c.capacidad_litros === capacidad) ?? null;

    if (!referencia) {
      faltan.push(`La capacidad ${capacidad} L no esta en el catalogo referencial.`);
    } else {
      const precio = await obtenerPrecioParametro(claveCilindro);

      if (!precio) {
        faltan.push(
          `No hay precio cargado para '${claveCilindro}' (cilindro de ${capacidad} L).`
        );
      } else {
        precioCilindro = Number(precio.valor);
      }
    }
  }

  // 2) La mano de obra de instalacion.
  const claveInstalacion = clavePrecioInstalacion();
  const instalacion = await obtenerPrecioParametro(claveInstalacion);

  if (!instalacion) {
    faltan.push(
      `No hay precio cargado para '${claveInstalacion}' (mano de obra de instalacion).`
    );
  }

  if (faltan.length > 0) {
    return {
      success: true,
      completo: false,
      referencia: true,
      moneda: instalacion?.moneda ?? 'BOB',
      aviso: 'Estimacion referencial. No es un presupuesto definitivo.',
      faltan,
      data: null,
    };
  }

  const precioInstalacion = Number(instalacion.valor);

  return {
    success: true,
    completo: true,
    referencia: true,
    moneda: instalacion.moneda,
    aviso: 'Estimacion referencial. No es un presupuesto definitivo.',
    data: {
      cilindro: {
        capacidad_litros: referencia.capacidad_litros,
        montaje: referencia.montaje,
        volumen_minimo_litros: referencia.volumen_minimo_litros,
        peso_kg: referencia.peso_kg,
      },
      desglose: {
        cilindro: precioCilindro,
        instalacion: precioInstalacion,
        total_unitario: Number((precioCilindro + precioInstalacion).toFixed(2)),
      },
      cantidad: unidades,
      subtotal: Number(((precioCilindro + precioInstalacion) * unidades).toFixed(2)),
    },
  };
}
