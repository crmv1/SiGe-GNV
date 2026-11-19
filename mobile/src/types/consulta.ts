import type { EstadoVehiculoPublico } from './vehicle';

export interface ConsultaPlaca {
  placa: string;
  proxima_inspeccion: string | null;
  estado_inspeccion: EstadoVehiculoPublico;
  proxima_recalificacion: string | null;
  estado_recalificacion: EstadoVehiculoPublico;
}

export interface ConsultaPlacaResponse {
  success: boolean;
  data: ConsultaPlaca;
}