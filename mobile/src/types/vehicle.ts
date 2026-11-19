// Estados de un servicio (inspeccion / recalificacion): dos
// vocabularios distintos segun el endpoint. La app los mapea a
// 4 etiquetas: VIGENTE / PRÓXIMO / VENCIDO / SIN REGISTRO.
export type EstadoVehiculoCliente =
  | 'sin_fecha'
  | 'vencido'
  | 'vence_hoy'
  | 'por_vencer'
  | 'vigente';

export type EstadoVehiculoPublico =
  | 'sin_registro'
  | 'vencido'
  | 'por_vencer'
  | 'vigente';

export interface ServicioVehiculo {
  fecha_realizada: string | null;
  fecha_vencimiento: string;
  dias_restantes: number | null;
  estado: string;
}

export interface Vehiculo {
  id_vehiculo: number;
  placa: string;
  inspeccion: ServicioVehiculo;
  recalificacion: ServicioVehiculo;
}

export interface ClienteInfo {
  id?: number;
  nombre?: string | null;
  apellido?: string | null;
}

export interface VehiculosResponse {
  success: boolean;
  vinculado: boolean;
  cliente: ClienteInfo | null;
  vehiculos: Vehiculo[];
}

export interface VehiculoDetalleResponse {
  success: boolean;
  vehiculo: Vehiculo;
}