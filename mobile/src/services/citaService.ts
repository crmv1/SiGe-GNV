// src/services/citaService.ts
// Servicio de citas para la app del cliente. Sigue el patrón de
// vehicleService: llama a la API y normaliza errores con
// normalizarError para que las pantallas puedan decidir (401 =
// sesión expirada, etc.).
import { api, normalizarError } from './api';

// --- Tipos -----------------------------------------------------------

/** Estado de un servicio de fechas (vencido / por vencer / etc.). */
export interface EstadoInfo {
  etiqueta: string;
  color: string;
  orden: number;
  tipo: 'proceso' | 'excepcional';
}

export interface Cita {
  id: number;
  fecha: string;
  hora_inicio: string;
  hora_fin: string | null;
  tipo_servicio: string;
  tipo_vehiculo: 'publico' | 'privado' | null;
  estado: string;
  estado_info: EstadoInfo | null;
  placa: string;
  vehiculo_id: number;
  origen: string;
}

export interface MisCitasResponse {
  success: boolean;
  citas: Cita[];
  estados: Record<string, EstadoInfo>;
}

export interface DisponibilidadSlot {
  hora_inicio: string;
  hora_fin: string;
  disponible: boolean;
}

export interface DisponibilidadResponse {
  success: boolean;
  slots: DisponibilidadSlot[];
}

export interface CrearCitaResponse {
  success: boolean;
  cita_id: number;
  estado: string;
}

// --- Endpoints -------------------------------------------------------

/** Lista las citas del cliente autenticado. */
export async function getMisCitas(): Promise<MisCitasResponse> {
  try {
    const { data } = await api.get<MisCitasResponse>('/cliente/mis-citas');
    return data;
  } catch (err) {
    throw normalizarError(err);
  }
}

/** Reserva una cita de recalificación. El tipo de vehículo es opcional. */
export async function reservarCita(body: {
  vehiculo_id: number;
  fecha: string;
  hora_inicio: string;
  tipo_vehiculo?: 'publico' | 'privado';
}): Promise<CrearCitaResponse> {
  try {
    const { data } = await api.post<CrearCitaResponse>('/cliente/citas', body);
    return data;
  } catch (err) {
    throw normalizarError(err);
  }
}

/** Horarios disponibles para una fecha (YYYY-MM-DD). */
export async function getDisponibilidad(fecha: string): Promise<DisponibilidadResponse> {
  try {
    const { data } = await api.get<DisponibilidadResponse>(
      `/agenda/disponibilidad?fecha=${fecha}`
    );
    return data;
  } catch (err) {
    throw normalizarError(err);
  }
}

/** Cancela una cita propia. */
export async function cancelarCita(id: number): Promise<{ success: boolean }> {
  try {
    const { data } = await api.patch<{ success: boolean }>(`/cliente/citas/${id}/cancelar`);
    return data;
  } catch (err) {
    throw normalizarError(err);
  }
}

/** Reprograma una cita propia a otra fecha/hora. */
export async function reprogramarCita(
  id: number,
  body: { fecha: string; hora_inicio: string }
): Promise<{ success: boolean }> {
  try {
    const { data } = await api.patch<{ success: boolean }>(
      `/cliente/citas/${id}/reprogramar`,
      body
    );
    return data;
  } catch (err) {
    throw normalizarError(err);
  }
}
