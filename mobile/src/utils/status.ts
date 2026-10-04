// Unifica los dos vocabularios de estados del backend (cliente y
// publico) en 4 etiquetas legibles que usa toda la app:
//   VIGENTE        -> renovado, todo en orden
//   PRÓXIMO        -> por vencer (o vence hoy)
//   VENCIDO        -> ya paso la fecha
//   SIN REGISTRO   -> sin fecha conocida / sin registro
export type EtiquetaEstado = 'VIGENTE' | 'PRÓXIMO' | 'VENCIDO' | 'SIN REGISTRO';

const CLIENTE_A_ETIQUETA: Record<string, EtiquetaEstado> = {
  vigente: 'VIGENTE',
  por_vencer: 'PRÓXIMO',
  vence_hoy: 'PRÓXIMO',
  vencido: 'VENCIDO',
  sin_fecha: 'SIN REGISTRO',
};

const PUBLICO_A_ETIQUETA: Record<string, EtiquetaEstado> = {
  vigente: 'VIGENTE',
  por_vencer: 'PRÓXIMO',
  vencido: 'VENCIDO',
  sin_registro: 'SIN REGISTRO',
};

export function etiquetaEstado(estado: string | null | undefined): EtiquetaEstado {
  if (!estado) return 'SIN REGISTRO';
  return CLIENTE_A_ETIQUETA[estado] ?? PUBLICO_A_ETIQUETA[estado] ?? 'SIN REGISTRO';
}