import type { ActivarResponse, LoginResponse, Usuario } from '../types/auth';
import type { ConsultaPlacaResponse } from '../types/consulta';
import type { NotificacionesResponse } from '../types/notification';
import type { VehiculoDetalleResponse, VehiculosResponse } from '../types/vehicle';

// Datos de ejemplo para EXPO_PUBLIC_USE_MOCK_DATA=true.
// Permiten recorrer toda la app sin backend levantado: mismas
// formas de respuesta que la API real, para que el dia que se
// cambie la variable nada mas, la app apunte al servidor.

export const MOCK_USUARIO: Usuario = { id: 1, username: 'cliente.demo', rol: 'cliente' };

let siguienteNotificacionId = 1;

export async function mockLogin(_username: string, _password: string): Promise<LoginResponse> {
  return { success: true, user: MOCK_USUARIO, token: 'mock-token-no-usar-en-produccion' };
}

export async function mockActivar(_: unknown): Promise<ActivarResponse> {
  return {
    success: true,
    token: 'mock-token-no-usar-en-produccion',
    user: MOCK_USUARIO,
    cliente: { id: 1, nombre: 'Carlos', apellido: 'Prueba' },
  };
}

export async function mockConsultarPlaca(placa: string): Promise<ConsultaPlacaResponse> {
  return {
    success: true,
    data: {
      placa: placa.toUpperCase(),
      proxima_inspeccion: '2027-10-09',
      estado_inspeccion: 'vigente',
      proxima_recalificacion: '2027-06-20',
      estado_recalificacion: 'vigente',
    },
  };
}

export async function mockVehiculos(): Promise<VehiculosResponse> {
  return {
    success: true,
    vinculado: true,
    cliente: { id: 1, nombre: 'Carlos', apellido: 'Prueba' },
    vehiculos: [
      {
        id_vehiculo: 1,
        placa: '123ABC',
        inspeccion: {
          fecha_realizada: '2026-10-09',
          fecha_vencimiento: '2027-10-09',
          dias_restantes: 379,
          estado: 'vigente',
        },
        recalificacion: {
          fecha_realizada: '2022-06-20',
          fecha_vencimiento: '2027-06-20',
          dias_restantes: 640,
          estado: 'vigente',
        },
      },
      {
        id_vehiculo: 2,
        placa: '4567DEF',
        inspeccion: {
          fecha_realizada: '2026-03-09',
          fecha_vencimiento: '2027-03-09',
          dias_restantes: -204,
          estado: 'vencido',
        },
        recalificacion: {
          fecha_realizada: null,
          fecha_vencimiento: '2028-01-01',
          dias_restantes: 464,
          estado: 'vigente',
        },
      },
    ],
  };
}

export async function mockVehiculo(id: number): Promise<VehiculoDetalleResponse> {
  const lista = await mockVehiculos();
  const vehiculo =
    lista.vehiculos.find((v) => v.id_vehiculo === id) ?? lista.vehiculos[0];
  return { success: true, vehiculo };
}

export async function mockNotificaciones(soloNoLeidas: boolean): Promise<NotificacionesResponse> {
  const base: NotificacionesResponse['notificaciones'] = [
    {
      id: siguienteNotificacionId++,
      tipo: 'inspeccion',
      titulo: 'Inspección anual próxima',
      mensaje: 'Tu inspección anual vence el 09/10/2026. Agéndala con tiempo.',
      fecha: '2026-09-29',
      leida: false,
      vehiculo: { placa: '123ABC' },
    },
    {
      id: siguienteNotificacionId++,
      tipo: 'recalificacion',
      titulo: 'Recalificación próxima',
      mensaje: 'Tu recalificación vence el 20/06/2027.',
      fecha: '2027-06-10',
      leida: false,
      vehiculo: { placa: '123ABC' },
    },
  ];
  const lista = soloNoLeidas ? base.filter((n) => !n.leida) : base;
  const noLeidas = base.filter((n) => !n.leida).length;
  return { success: true, notificaciones: lista, no_leidas: noLeidas };
}

export async function mockMarcarLeida(id: number): Promise<{ success: boolean; id: number; leida: true }> {
  return { success: true, id, leida: true };
}