export type Rol = 'tecnico' | 'administrador' | 'cliente';

export interface Usuario {
  id: number;
  username: string;
  rol: Rol;
}

export interface LoginResponse {
  success?: boolean;
  user: Usuario;
  token: string;
}

export interface ActivarResponse {
  success: boolean;
  token: string;
  user: Usuario;
  cliente: { id: number; nombre: string; apellido: string } | null;
}

export interface Sesion {
  token: string;
  user: Usuario;
}

export interface Credenciales {
  username: string;
  password: string;
}

export interface DatosActivacion {
  username: string;
  codigo: string;
  password: string;
}