import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import FAQScreen from '../screens/FAQScreen';
import HomeScreen from '../screens/HomeScreen';
import MyVehiclesScreen from '../screens/MyVehiclesScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import VehicleDetailScreen from '../screens/VehicleDetailScreen';
import * as notificationService from '../services/notificationService';
import { colores } from '../theme';
import type { AppStackParamList, TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<AppStackParamList>();

const ICONOS: Record<keyof TabParamList, string> = {
  Inicio: '🏠',
  MisVehiculos: '🚗',
  Avisos: '🔔',
  FAQ: '❓',
  Perfil: '👤',
};

function TabIcon({ nombre, focused }: { nombre: keyof TabParamList; focused: boolean }) {
  return (
    <Text style={[styles.icono, focused && styles.iconoActivo]}>{ICONOS[nombre]}</Text>
  );
}

function Tabs() {
  const [noLeidas, setNoLeidas] = useState(0);

  // El contador del badge se actualiza cuando la app toma foco y
  // cada vez que se abre la pestaña de avisos.
  const refrescarBadge = useCallback(() => {
    notificationService
      .listNotificaciones()
      .then((r) => setNoLeidas(r.no_leidas))
      .catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      refrescarBadge();
    }, [refrescarBadge])
  );

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colores.primario,
        tabBarInactiveTintColor: colores.textoSecundario,
        tabBarStyle: { backgroundColor: colores.superficie },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="Inicio"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Inicio',
          tabBarIcon: ({ focused }) => <TabIcon nombre="Inicio" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="MisVehiculos"
        component={MyVehiclesScreen}
        options={{
          tabBarLabel: 'Vehículos',
          tabBarIcon: ({ focused }) => <TabIcon nombre="MisVehiculos" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Avisos"
        component={NotificationsScreen}
        options={{
          tabBarLabel: 'Avisos',
          tabBarIcon: ({ focused }) => <TabIcon nombre="Avisos" focused={focused} />,
          tabBarBadge: noLeidas > 0 ? noLeidas : undefined,
          tabBarBadgeStyle: { backgroundColor: colores.rojo, color: '#FFFFFF' },
        }}
        listeners={{ focus: refrescarBadge }}
      />
      <Tab.Screen
        name="FAQ"
        component={FAQScreen}
        options={{
          tabBarLabel: 'FAQ',
          tabBarIcon: ({ focused }) => <TabIcon nombre="FAQ" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Perfil"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Perfil',
          tabBarIcon: ({ focused }) => <TabIcon nombre="Perfil" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

// La app con sesion: un stack arriba de las tabs para poder abrir
// el detalle de un vehiculo y (a futuro) una notificacion.
export default function AppNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerTintColor: colores.texto,
        headerStyle: { backgroundColor: colores.superficie },
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: colores.fondo },
      }}
    >
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen
        name="VehicleDetail"
        component={VehicleDetailScreen}
        options={{ title: 'Detalle del vehículo' }}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  icono: {
    fontSize: 20,
  },
  iconoActivo: {
    transform: [{ scale: 1.1 }],
  },
});