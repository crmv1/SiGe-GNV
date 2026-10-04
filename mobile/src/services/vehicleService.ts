import { USE_MOCK_DATA } from '../config';
import type { VehiculoDetalleResponse, VehiculosResponse } from '../types/vehicle';
import { api, normalizarError } from './api';
import { mockVehiculo, mockVehiculos } from './mock';

export async function getVehiculos(): Promise<VehiculosResponse> {
  if (USE_MOCK_DATA) return mockVehiculos();
  try {
    const { data } = await api.get<VehiculosResponse>('/cliente/vehiculos');
    return data;
  } catch (err) {
    throw normalizarError(err);
  }
}

export async function getVehiculo(id: number): Promise<VehiculoDetalleResponse> {
  if (USE_MOCK_DATA) return mockVehiculo(id);
  try {
    const { data } = await api.get<VehiculoDetalleResponse>(`/cliente/vehiculos/${id}`);
    return data;
  } catch (err) {
    throw normalizarError(err);
  }
}