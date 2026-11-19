// ============================================================
//  src/modules/citas/citas.service.js
//  Reglas del modulo de citas / agenda de recalificacion.
//
//  ------------------------------------------------------------
//  EL PROCESO DE RECALIFICACION
//  ------------------------------------------------------------
//  El taller no piensa en "reservada/confirmada/completada": piensa
//  en el PROCESO fisico del auto. Para un vehiculo PUBLICO dura
//  ~3 dias:
//
//    baja el tanque -> va a la recalificadora (mientras el taller
//    cambia accesorios de gas) -> vuelve el tanque -> se monta ->
//    se prueba -> se entrega.
//
//  Para un PRIVADO (o privado total) el mismo flujo se resuelve en
//  el dia: solo cambia cañeria y el tanque pasa rapido.
//
//  Esos 6 pasos son los ESTADOS DEL PROCESO. El cliente los ve en
//  la app movil y el admin / tecnico los avanza desde la web.
//
//  ------------------------------------------------------------
//  TIPO_VEHICULO (publico / privado)
//  ------------------------------------------------------------
//  Se elige AL RESERVAR (no se asume del vehiculo) porque un
//  "publico" a veces lo hacen como "privado". El taller lo confirma.
// ============================================================

// Orden del proceso. Un estado "de proceso" es lineal: avanza de
// uno al siguiente. Los excepcionales quedan fuera del flujo.
export const ESTADOS_PROCESO = [
  'RESERVADA',
  'EN_TALLER',
  'TANQUE_EN_RECALIFICADORA',
  'MONTAJE_Y_PRUEBA',
  'LISTA_PARA_RETIRO',
  'ENTREGADA',
];

export const ESTADOS_EXCEPCIONALES = ['CANCELADA', 'NO_ASISTIO', 'REPROGRAMADA'];

// El vocabulario completo, con etiqueta legible, color (para la web
// y la app) y el orden dentro del proceso (null = excepcional).
export const ESTADOS = {
  RESERVADA: {
    etiqueta: 'Reservada',
    color: '#3b82f6',
    orden: 1,
    tipo: 'proceso',
    detalle: 'Cita agendada. El vehículo todavía no ingresó.',
  },
  EN_TALLER: {
    etiqueta: 'En taller',
    color: '#8b5cf6',
    orden: 2,
    tipo: 'proceso',
    detalle: 'El vehículo ingresó al taller.',
  },
  TANQUE_EN_RECALIFICADORA: {
    etiqueta: 'Tanque en recalificadora',
    color: '#f59e0b',
    orden: 3,
    tipo: 'proceso',
    detalle: 'Tanque fuera / en recertificación. El taller cambia accesorios o cañería.',
  },
  MONTAJE_Y_PRUEBA: {
    etiqueta: 'Montaje y prueba',
    color: '#06b6d4',
    orden: 4,
    tipo: 'proceso',
    detalle: 'Tanque de vuelta: se monta y se prueba el sistema.',
  },
  LISTA_PARA_RETIRO: {
    etiqueta: 'Lista para retiro',
    color: '#10b981',
    orden: 5,
    tipo: 'proceso',
    detalle: 'Todo listo. Falta entregar el vehículo.',
  },
  ENTREGADA: {
    etiqueta: 'Entregada',
    color: '#22c55e',
    orden: 6,
    tipo: 'proceso',
    detalle: 'Vehículo entregado. Proceso cerrado.',
  },
  CANCELADA: {
    etiqueta: 'Cancelada',
    color: '#6b7280',
    orden: null,
    tipo: 'excepcional',
    detalle: 'La cita fue cancelada.',
  },
  NO_ASISTIO: {
    etiqueta: 'No asistió',
    color: '#ef4444',
    orden: null,
    tipo: 'excepcional',
    detalle: 'El cliente no presentó el vehículo.',
  },
  REPROGRAMADA: {
    etiqueta: 'Reprogramada',
    color: '#f97316',
    orden: null,
    tipo: 'excepcional',
    detalle: 'La cita se movió a otra fecha u hora.',
  },
};

// Transiciones permitidas: de cada estado, a cuales se puede pasar.
// Se decide en el backend, no en el frontend: la web solo pinta lo
// que el servidor autoriza.
export const TRANSICIONES = {
  RESERVADA: ['EN_TALLER', 'CANCELADA', 'REPROGRAMADA'],
  EN_TALLER: ['TANQUE_EN_RECALIFICADORA', 'CANCELADA', 'NO_ASISTIO'],
  TANQUE_EN_RECALIFICADORA: ['MONTAJE_Y_PRUEBA', 'CANCELADA'],
  MONTAJE_Y_PRUEBA: ['LISTA_PARA_RETIRO', 'CANCELADA'],
  LISTA_PARA_RETIRO: ['ENTREGADA', 'CANCELADA'],
  ENTREGADA: [], // cerrada: no se reabre
  CANCELADA: ['RESERVADA'], // se puede rehacer como reserva
  NO_ASISTIO: ['RESERVADA'],
  REPROGRAMADA: ['RESERVADA'],
};

// El servicio del taller. La reserva del CLIENTE es SOLO
// recalificacion (regla del negocio). El tipo quedo en el enum por
// si el taller necesita una cita de inspeccion a futuro, pero el
// endpoint de cliente lo fuerza a 'recalificacion'.
export const TIPOS_SERVICIO = ['inspeccion', 'recalificacion'];
export const TIPO_RESERVA_CLIENTE = 'recalificacion';

export const TIPOS_VEHICULO = ['publico', 'privado'];

/** ¿Este estado existe en el vocabulario? */
export function esEstadoValido(estado) {
  return Object.prototype.hasOwnProperty.call(ESTADOS, estado);
}

/** ¿Se puede pasar de `desde` a `hacia`? */
export function transicionPermitida(desde, hacia) {
  const permitidas = TRANSICIONES[desde] || [];
  return permitidas.includes(hacia);
}

/** Devuelve el estado con su etiqueta/color, o uno por defecto. */
export function describirEstado(estado) {
  return (
    ESTADOS[estado] || {
      etiqueta: estado,
      color: '#6b7280',
      orden: null,
      tipo: 'desconocido',
      detalle: '',
    }
  );
}

/**
 * Siguiente estado del proceso lineal (para "avanzar" rápido desde
 * la web). Devuelve null si ya esta entregada o es excepcional.
 */
export function siguienteEstado(estado) {
  const i = ESTADOS_PROCESO.indexOf(estado);
  if (i === -1 || i >= ESTADOS_PROCESO.length - 1) return null;
  return ESTADOS_PROCESO[i + 1];
}
