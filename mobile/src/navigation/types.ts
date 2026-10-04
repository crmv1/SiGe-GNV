import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

// Parametros de la navegacion publica (sin sesion).
export type PublicStackParamList = {
  PublicHome: undefined;
  PlateResult: { placa: string };
  Login: undefined;
  Activate: undefined;
};

// Parametros de la app (con sesion): un stack que abarca las tabs
// y empuja pantallas de detalle encima.
export type AppStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  VehicleDetail: { id: number; placa: string };
};

export type TabParamList = {
  Inicio: undefined;
  MisVehiculos: undefined;
  Avisos: undefined;
  FAQ: undefined;
  Perfil: undefined;
};

export type PublicScreenProps<T extends keyof PublicStackParamList> = NativeStackScreenProps<
  PublicStackParamList,
  T
>;

export type AppScreenProps<T extends keyof AppStackParamList> = NativeStackScreenProps<
  AppStackParamList,
  T
>;

export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  NativeStackScreenProps<AppStackParamList>
>;