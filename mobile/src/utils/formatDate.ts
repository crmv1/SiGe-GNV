// Convierte 'YYYY-MM-DD' a 'DD/MM/YYYY' para mostrar en la app.
// El backend decide las fechas; la app solo formatea.
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const y = iso.slice(0, 4);
  const m = iso.slice(5, 7);
  const d = iso.slice(8, 10);
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function formatDiasRestantes(dias: number | null | undefined): string {
  if (dias === null || dias === undefined) return 'sin fecha';
  if (dias === 0) return 'vence hoy';
  if (dias < 0) return `venció hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? '' : 's'}`;
  return `faltan ${dias} día${dias === 1 ? '' : 's'}`;
}