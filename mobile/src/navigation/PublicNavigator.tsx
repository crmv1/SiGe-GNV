import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colores } from '../theme';
import ActivateAccountScreen from '../screens/ActivateAccountScreen';
import LoginScreen from '../screens/LoginScreen';
import PlateResultScreen from '../screens/PlateResultScreen';
import PublicHomeScreen from '../screens/PublicHomeScreen';
import type { PublicStackParamList } from './types';

const Stack = createNativeStackNavigator<PublicStackParamList>();

// Navegacion de la parte publica: consulta por placa, login y
// activacion. Todo sin sesion.
export default function PublicNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerTintColor: colores.texto,
        headerStyle: { backgroundColor: colores.superficie },
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: colores.fondo },
      }}
    >
      <Stack.Screen
        name="PublicHome"
        component={PublicHomeScreen}
        options={{ headerShown: false, title: 'SIGE-GNV VC GAS' }}
      />
      <Stack.Screen
        name="PlateResult"
        component={PlateResultScreen}
        options={{ title: 'Consulta por placa' }}
      />
      <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Iniciar sesión' }} />
      <Stack.Screen
        name="Activate"
        component={ActivateAccountScreen}
        options={{ title: 'Activar mi cuenta' }}
      />
    </Stack.Navigator>
  );
}