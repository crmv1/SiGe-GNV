// ============================================================
//  src/modules/predicciones/predicciones.service.js
//  Modelo de predicción / proyección mensual para el taller.
//
//  Tres series, con métodos distintos según la naturaleza del dato:
//
//  1) RECALIFICACIONES e INSPECCIONES  -> deterministas.
//     Se derivan de las fechas de vencimiento que ya están en
//     `vehiculos` (fecha_recalificacion / fecha_inspeccion). Cada
//     vehículo recalifica cada 5 años e inspecciona cada 1, así que
//     el pipeline futuro es CONOCIDO: se cuenta cuántos vencen en
//     cada mes. No es una estimación, es lo que ya está comprometido.
//
//  2) CONVERSIONES (altas de vehículos)  -> regresión lineal ponderada
//     + estacionalidad.
//     No hay tabla de conversiones; se modela como el ritmo de
//     registros nuevos (`vehiculos.created_at`). Se ajusta una
//     recta y = a + b·x por MÍNIMOS CUADRADOS PONDERADOS: cada mes
//     tiene un peso exponencial (λ=0.75), de modo que los meses
//     recientes influyen más que los viejos. Esto responde a que
//     el negocio puede cambiar de ritmo y un dato de hace dos años
//     no debe arrastrar la proyección actual.
//
//     Si hay ≥12 meses de historia se detecta ESTACIONALIDAD:
//     se calcula un índice por mes del año (ratio observado /
//     media móvil), y la proyección se multiplica por ese índice.
//     Un taller con más demanda en diciembre proyecta más en
//     diciembre, no una recta plana.
//
//     Se devuelve R² (coeficiente de determinación) para saber qué
//     tan bien ajusta la recta: R² cercano a 1 = buen ajuste,
//     cercano a 0 = la recta no explica casi nada.
//
//     Se devuelve un intervalo de confianza simple (±2·EE) basado
//     en el error estándar de los residuos.
//
//  3) CAPACIDAD del taller  -> alerta de saturación.
//     Compara las citas demandadas de cada mes (recal + insp) contra
//     la capacidad real (franjas por día × capacidad por franja ×
//     días laborables). Si se supera, marca el mes como saturado.
//
//  Ingresos: se estiman solo si hay un precio cargado en
//  `parametros_precios` (clave 'precio_recalificacion'). Si no, la
//  serie de ingresos viene en null.
// ============================================================
import { query } from '../../config/database.js';

const NOMBRES_MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const CLAVE_PRECIO_RECAL = 'precio_recalificacion';

// Peso exponencial para la regresión ponderada: un mes reciente
// pesa λ=0.75 veces más que el siguiente más viejo. Con λ=1 sería
// mínimos cuadrados ordinarios (todos pesan igual). λ=0.75 da a los
// últimos 6 meses ≈80% del peso total.
const LAMBDA_PESOS = 0.75;

// Meses mínimos de historia para intentar detectar estacionalidad.
const MESES_MIN_ESTACIONALIDAD = 12;

// ============================================================
//  Regresión lineal ponderada por mínimos cuadrados
// ============================================================
//
//  Objetivo: minimizar  Σ wᵢ · (yᵢ − (a + b·xᵢ))²
//
//  Las ecuaciones normales quedan:
//    b = (Σw·Σ(wxy) − Σ(wx)·Σ(wy)) / (Σw·Σ(wx²) − (Σwx)²)
//    a = (Σ(wy) − b·Σ(wx)) / Σw
//
//  Si todos los pesos son 1, colapsa al mínimo cuadrados ordinario.
//
/**
 * @param {number[]} puntos  valores y en posiciones x=0..n-1
 * @param {number[]} [pesos] pesos w (opcional; si no se pasa, todos 1)
 * @returns {{ pendiente:number, corte:number, r2:number, ee:number,
 *             ajuste:number[] }}
 */
function regresionPonderada(puntos, pesos) {
  const n = puntos.length;
  if (n === 0) return { pendiente: 0, corte: 0, r2: 0, ee: 0, ajuste: [] };
  if (n === 1) return { pendiente: 0, corte: puntos[0], r2: 0, ee: 0, ajuste: [puntos[0]] };

  const w = pesos || new Array(n).fill(1);

  let sw = 0, swx = 0, swy = 0, swxy = 0, swxx = 0;
  for (let i = 0; i < n; i += 1) {
    const x = i;
    const y = puntos[i];
    const wi = w[i];
    sw += wi;
    swx += wi * x;
    swy += wi * y;
    swxy += wi * x * y;
    swxx += wi * x * x;
  }

  const denom = sw * swxx - swx * swx;
  let pendiente, corte;
  if (denom === 0) {
    pendiente = 0;
    corte = swy / sw;
  } else {
    pendiente = (sw * swxy - swx * swy) / denom;
    corte = (swy - pendiente * swx) / sw;
  }

  // Ajuste (valores de la recta en cada x) y residuos.
  const ajuste = [];
  const residuos = [];
  let ssRes = 0, ssTot = 0;
  const mediaY = puntos.reduce((s, y) => s + y, 0) / n;
  for (let i = 0; i < n; i += 1) {
    const yHat = corte + pendiente * i;
    ajuste.push(yHat);
    const r = puntos[i] - yHat;
    residuos.push(r);
    ssRes += w[i] * r * r;
    ssTot += w[i] * (puntos[i] - mediaY) ** 2;
  }

  // R² = 1 − SS_res/SS_tot. Con pesos.
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  // Error estándar de los residuos (raíz de la media de r²).
  const gradosLibertad = Math.max(n - 2, 1);
  const ee = Math.sqrt(ssRes / gradosLibertad);

  return { pendiente, corte, r2, ee, ajuste };
}

/**
 * Pesos exponenciales decrecientes: el mes más reciente (i=n-1)
 * pesa 1, y cada mes anterior se multiplica por λ.
 */
function pesosExponenciales(n, lambda = LAMBDA_PESOS) {
  const w = new Array(n);
  for (let i = 0; i < n; i += 1) {
    w[i] = Math.pow(lambda, n - 1 - i);
  }
  return w;
}

// ============================================================
//  Estacionalidad
// ============================================================
//
//  Si hay ≥12 meses de historia, se calcula un ÍNDICE ESTACIONAL
//  por mes del año (1..12):
//
//    índice[m] = media(observado[m] / media_móvil_12[m])
//
//  donde la media móvil de 12 meses suaviza la tendencia para
//  aislar el patrón estacional. Se re-normalizan para que el
//  promedio de los 12 índices sea 1 (si no, la proyección se
//  inflaría o deflacionaría).
//
//  La proyección final queda:  tendencia × índice_estacional.
//
/**
 * Detecta estacionalidad en una serie mensual continua.
 * Devuelve un mapa { mesDelAnio(1-12): indice } o null si no hay
 * datos suficientes.
 */
function detectarEstacionalidad(serie) {
  const n = serie.length;
  if (n < MESES_MIN_ESTACIONALIDAD) return null;

  // Media móvil de 12 meses (centrada en i, ventana [i-5, i+6]).
  // Para los bordes se usa la ventana disponible.
  const mediaMovil = [];
  for (let i = 0; i < n; i += 1) {
    const ini = Math.max(0, i - 5);
    const fin = Math.min(n - 1, i + 6);
    let suma = 0;
    for (let j = ini; j <= fin; j += 1) suma += serie[j];
    mediaMovil.push(suma / (fin - ini + 1));
  }

  // Ratio observado / media móvil por posición.
  // La posición i corresponde al mes (i % 12)+1 SOLO si la serie
  // empieza en Enero. Como no siempre es así, se calcula el mes
  // calendario real asumiendo que la serie empieza en el primer
  // mes de `minMes` (que se infiere del ISO).
  const ratios = {};
  for (let i = 0; i < n; i += 1) {
    if (mediaMovil[i] > 0) {
      const ratio = serie[i] / mediaMovil[i];
      // El mes del año se pasa como parámetro externo; aquí se
      // acumula por posición módulo 12 y luego se mapea.
      const clave = i % 12;
      if (!ratios[clave]) ratios[clave] = [];
      ratios[clave].push(ratio);
    }
  }

  // Promedio de ratios por posición módulo 12.
  const indices = {};
  for (let k = 0; k < 12; k += 1) {
    if (ratios[k] && ratios[k].length > 0) {
      indices[k] = ratios[k].reduce((s, r) => s + r, 0) / ratios[k].length;
    } else {
      indices[k] = 1;
    }
  }

  // Re-normalizar para que el promedio sea 1.
  const promedio = Object.values(indices).reduce((s, v) => s + v, 0) / 12;
  if (promedio > 0) {
    for (const k of Object.keys(indices)) indices[k] /= promedio;
  }

  return indices;
}

// ============================================================
//  Utilidades de fechas
// ============================================================

function etiquetaMes(iso) {
  const [y, m] = iso.split('-').map(Number);
  return `${NOMBRES_MESES[m - 1]} ${String(y).slice(2)}`;
}

function horasLaborablesPorDia(config) {
  const a = config.hora_apertura || '08:00:00';
  const c = config.hora_cierre || '18:00:00';
  const [hA, mA] = a.split(':').map(Number);
  const [hC, mC] = c.split(':').map(Number);
  return Math.max(hC + mC / 60 - (hA + mA / 60), 0);
}

// El backend usa 1=lunes..7=domingo. Se mapea a 0=domingo..6=sábado
// de JS para poder comparar con Date.getDay().
function diasLaborables(config) {
  const crudo = config.dias_laborales;
  const arr = Array.isArray(crudo) ? crudo : JSON.parse(crudo || '[1,2,3,4,5]');
  return arr.map((d) => (d === 7 ? 0 : d));
}

/** Capacidad de citas de un mes calendario (year, monthIndex 0-11). */
function capacidadDelMes(year, monthIndex, config) {
  const dias = diasLaborables(config);
  const dur = Number(config.duracion_cita_min || 60);
  const capFranja = Number(config.capacidad_por_franja || 1);
  const franjasPorDia = Math.floor((horasLaborablesPorDia(config) * 60) / dur);
  if (franjasPorDia <= 0) return 0;

  const diasEnMes = new Date(year, monthIndex + 1, 0).getDate();
  let diasLab = 0;
  for (let d = 1; d <= diasEnMes; d += 1) {
    if (dias.includes(new Date(year, monthIndex, d).getDay())) diasLab += 1;
  }
  return diasLab * franjasPorDia * capFranja;
}

/** Meses calendario futuros (incluye el actual), con año/mes/etiqueta. */
function listaMeses(cantidad) {
  const hoy = new Date();
  const out = [];
  for (let i = 0; i < cantidad; i += 1) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
    const year = d.getFullYear();
    const monthIndex = d.getMonth();
    const iso = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    out.push({ iso, year, monthIndex, etiqueta: etiquetaMes(iso) });
  }
  return out;
}

/** Distancia en meses entre dos ISO "YYYY-MM" (b - a). Si b<a, negativo. */
function difMeses(isoA, isoB) {
  const [yA, mA] = isoA.split('-').map(Number);
  const [yB, mB] = isoB.split('-').map(Number);
  return (yB - yA) * 12 + (mB - mA);
}

// ============================================================
//  Proyección principal
// ============================================================
export async function proyectar({ meses = 12 } = {}) {
  const n = Math.min(Math.max(Number.parseInt(meses, 10) || 12, 1), 36);
  const mesesCal = listaMeses(n);

  // --- 1) Vencimientos conocidos (pipeline determinista) ---
  const vencimientos = await query(
    `SELECT DATE_FORMAT(fecha_recalificacion, '%Y-%m') AS mes_recal,
            DATE_FORMAT(fecha_inspeccion, '%Y-%m') AS mes_insp
       FROM vehiculos
      WHERE fecha_recalificacion IS NOT NULL OR fecha_inspeccion IS NOT NULL`
  );
  const recalPorMes = {};
  const inspPorMes = {};
  for (const v of vencimientos) {
    if (v.mes_recal) recalPorMes[v.mes_recal] = (recalPorMes[v.mes_recal] || 0) + 1;
    if (v.mes_insp) inspPorMes[v.mes_insp] = (inspPorMes[v.mes_insp] || 0) + 1;
  }

  // --- 2) Altas históricas para la tendencia de conversiones ---
  const altas = await query(
    `SELECT DATE_FORMAT(created_at, '%Y-%m') AS mes, COUNT(*) AS total
       FROM vehiculos
      WHERE created_at IS NOT NULL
      GROUP BY mes ORDER BY mes ASC`
  );
  const historialMap = {};
  let minMes = null;
  let maxMes = null;
  for (const a of altas) {
    historialMap[a.mes] = Number(a.total) || 0;
    if (!minMes || a.mes < minMes) minMes = a.mes;
    if (!maxMes || a.mes > maxMes) maxMes = a.mes;
  }

  // Serie continua mes a mes desde el primer alta hasta el último.
  const serieHistorica = [];
  // Mes del año (0-11) de cada posición de la serie, para poder
  // mapear los índices estacionales después.
  const mesAnioPosicion = [];
  if (minMes && maxMes) {
    let [y, m] = minMes.split('-').map(Number);
    const [yFin, mFin] = maxMes.split('-').map(Number);
    while (y < yFin || (y === yFin && m <= mFin)) {
      serieHistorica.push(historialMap[`${y}-${String(m).padStart(2, '0')}`] || 0);
      mesAnioPosicion.push(m - 1); // 0=Enero
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
  }

  // --- 2a) Regresión ponderada ---
  const pesos = pesosExponenciales(serieHistorica.length);
  const reg = regresionPonderada(serieHistorica, pesos);
  const baseX = serieHistorica.length;

  // --- 2b) Estacionalidad ---
  // Se detecta sobre la serie SIN tendencia (residuos + media), o
  // directamente sobre la serie si no hay tendencia fuerte.
  // La forma simple: ratio de cada mes contra la media móvil.
  const estacional = detectarEstacionalidad(serieHistorica);

  // Re-mapear los índices estacionales de "posición módulo 12" a
  // "mes calendario real". La posición 0 corresponde al mes
  // `minMes`; el índice para un mes futuro se busca por su mes
  // del año.
  function indiceEstacional(mesCalendario0a11) {
    if (!estacional) return 1;
    // Buscar la clave módulo 12 que corresponde a este mes del año.
    // Como la serie puede empezar en cualquier mes, se calcula:
    //   posición del primer enero en la serie = (12 - mesInicio) % 12
    //   clave = (posAnio + mesInicio) % 12 ... simplificado:
    // directamente usamos mesAnioPosicion[0] como referencia.
    const offset = mesAnioPosicion[0] ?? 0;
    const clave = ((mesCalendario0a11 - offset) % 12 + 12) % 12;
    return estacional[clave] ?? 1;
  }

  // --- 3) Capacidad y precio ---
  const [configRow] = await query('SELECT * FROM agenda_config WHERE activo=1 LIMIT 1');
  const config = configRow || {
    duracion_cita_min: 60, capacidad_por_franja: 1,
    dias_laborales: '[1,2,3,4,5]', hora_apertura: '08:00:00', hora_cierre: '18:00:00',
  };

  let precio = null;
  const [precioRow] = await query('SELECT valor FROM parametros_precios WHERE clave = ? LIMIT 1', [CLAVE_PRECIO_RECAL]);
  if (precioRow) {
    const v = Number(precioRow.valor);
    if (Number.isFinite(v)) precio = v;
  }

  // --- 4) Salida mes a mes ---
  const mesesOut = mesesCal.map((mc) => {
    const recal = recalPorMes[mc.iso] || 0;
    const insp = inspPorMes[mc.iso] || 0;

    let conversiones;
    let convMin = null;
    let convMax = null;

    if (maxMes && difMeses(mc.iso, maxMes) >= 0) {
      // Mes cubierto por el histórico: valor real, sin proyectar.
      conversiones = historialMap[mc.iso] ?? 0;
    } else {
      const x = maxMes ? baseX + difMeses(maxMes, mc.iso) : baseX;
      // Tendencia base (recta ponderada).
      const tendencia = reg.corte + reg.pendiente * x;
      // Ajuste estacional.
      const factorEst = indiceEstacional(mc.monthIndex);
      const cruda = tendencia * factorEst;
      conversiones = Math.max(0, Math.round(cruda));
      // Intervalo de confianza ±2·EE (≈95% si residuos normales).
      const margen = 2 * reg.ee * factorEst;
      convMin = Math.max(0, Math.round(cruda - margen));
      convMax = Math.max(0, Math.round(cruda + margen));
    }

    const capacidad = capacidadDelMes(mc.year, mc.monthIndex, config);
    const demanda = recal + insp;
    const saturado = capacidad > 0 && demanda > capacidad;

    return {
      iso: mc.iso,
      etiqueta: mc.etiqueta,
      recalificaciones: recal,
      inspecciones: insp,
      conversiones,
      conversiones_min: convMin,
      conversiones_max: convMax,
      capacidad,
      demanda_total: demanda,
      saturado,
      ingreso_estimado: precio !== null ? recal * precio : null,
    };
  });

  // --- 5) Resumen ---
  const totalRecal = mesesOut.reduce((s, m) => s + m.recalificaciones, 0);
  const totalInsp = mesesOut.reduce((s, m) => s + m.inspecciones, 0);
  const totalConv = mesesOut.reduce((s, m) => s + m.conversiones, 0);
  const mesPico = mesesOut.reduce((a, b) => (b.recalificaciones > a.recalificaciones ? b : a), mesesOut[0]);
  const mesesSaturados = mesesOut.filter((m) => m.saturado).map((m) => m.etiqueta);
  const trimestre = mesesOut.slice(0, 3);

  // --- 6) Diagnóstico del modelo ---
  const nHist = serieHistorica.length;
  const confiabilidad =
    nHist >= 24 && reg.r2 >= 0.5 ? 'alta' :
    nHist >= 12 && reg.r2 >= 0.3 ? 'media' :
    nHist >= 6 ? 'baja' : 'muy_baja';

  const descripcion = (() => {
    if (nHist < 3) return 'Historial insuficiente para proyectar una tendencia sólida.';
    const dir = reg.pendiente >= 0 ? 'sube' : 'baja';
    let txt = `Las altas ${dir} ${Math.abs(reg.pendiente).toFixed(2)} vehículos/mes.`;
    txt += ` R²=${reg.r2.toFixed(2)} (${nHist} meses de historia).`;
    if (estacional) txt += ' Con patrón estacional detectado.';
    return txt;
  })();

  return {
    meses: mesesOut,
    resumen: {
      total_recalificaciones: totalRecal,
      total_inspecciones: totalInsp,
      total_conversiones: totalConv,
      mes_pico_recalificaciones: mesPico ? mesPico.etiqueta : null,
      meses_saturados: mesesSaturados,
      trimestre: {
        recalificaciones: trimestre.reduce((s, m) => s + m.recalificaciones, 0),
        inspecciones: trimestre.reduce((s, m) => s + m.inspecciones, 0),
        conversiones: trimestre.reduce((s, m) => s + m.conversiones, 0),
      },
    },
    conversiones_modelo: {
      // --- Ajuste de la recta ---
      pendiente: Number(reg.pendiente.toFixed(4)),
      corte: Number(reg.corte.toFixed(4)),
      // --- Calidad del ajuste ---
      r2: Number(reg.r2.toFixed(4)),
      error_estandar: Number(reg.ee.toFixed(4)),
      intervalo_confianza: '±2·EE (≈95%)',
      meses_historia: nHist,
      confiabilidad,
      // --- Estacionalidad ---
      estacionalidad_detectada: Boolean(estacional),
      indices_estacionales: estacional
        ? Object.fromEntries(
            Object.entries(estacional).map(([k, v]) => [NOMBRES_MESES[Number(k)], Number(v.toFixed(3))])
          )
        : null,
      // --- Ponderación ---
      lambda_ponderacion: LAMBDA_PESOS,
      descripcion,
    },
    ingresos: precio !== null
      ? {
          precio,
          moneda: 'BOB',
          estimacion: mesesOut.map((m) => ({ iso: m.iso, etiqueta: m.etiqueta, ingreso: m.ingreso_estimado })),
        }
      : null,
    capacidad_config: {
      duracion_cita_min: Number(config.duracion_cita_min || 60),
      capacidad_por_franja: Number(config.capacidad_por_franja || 1),
    },
  };
}
