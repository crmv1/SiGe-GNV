export type TipoAviso = 'inspeccion' | 'recalificacion' | string;

export interface Notificacion {
  id: number;
  tipo: TipoAviso;
  titulo: string;
  mensaje: string;
  fecha: string;
  leida: boolean;
  vehiculo: {
    placa: string;
  };
}

export interface NotificacionesResponse {
  success: boolean;
  notificaciones: Notificacion[];
  no_leidas: number;
}