import { USE_MOCK_DATA } from '../config';
import type { ConsultaPlacaResponse } from '../types/consulta';
import { api, normalizarError } from './api';
import { mockConsultarPlaca } from './mock';

export async function consultarPlaca(placa: string): Promise<ConsultaPlacaResponse> {
  if (USE_MOCK_DATA) return mockConsultarPlaca(placa);
  try {
    const { data } = await api.get<ConsultaPlacaResponse>(
      `/public/consulta/placa/${encodeURIComponent(placa)}`
    );
    return data;
  } catch (err) {
    throw normalizarError(err);
  }
}