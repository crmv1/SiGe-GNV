// Formato de placa boliviana: de 1 a 4 numeros seguidos de
// exactamente 3 letras. El orden es fijo: numeros primero, letras
// despues. Ejemplos validos: 1ABC, 12ABC, 123ABC, 1234ABC.
// El mismo criterio que valida el backend
// (src/modules/vehiculos/vehiculos.service.js).
export const PLACA_REGEX = /^\d{1,4}[A-Z]{3}$/;

// Normaliza como la teclea el usuario: mayusculas, sin espacios,
// guiones ni signos. " 1234-abc " -> "1234ABC".
export function normalizePlate(placa: string): string {
  return placa.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// True si la placa cumple el formato 123ABC / 1234ABC.
export function esPlacaValida(placa: string): boolean {
  return PLACA_REGEX.test(normalizePlate(placa));
}

// Mensaje de error segun el formato que fallo.
export function errorDePlaca(placa: string): string | null {
  const limpia = normalizePlate(placa);
  if (!limpia) return 'Escribe una placa para consultar.';
  if (esPlacaValida(limpia)) return null;
  return 'Placa inválida. Se esperan de 1 a 4 números seguidos de 3 letras (ej: 123ABC).';
}