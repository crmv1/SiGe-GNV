import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LoadingIndicator from './src/components/LoadingIndicator';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import PublicNavigator from './src/navigation/PublicNavigator';

const tema = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#0B5ED7',
    background: '#F3F6FB',
    card: '#FFFFFF',
    text: '#0F172A',
    border: '#E2E8F0',
  },
};

function Root() {
  const { usuario, inicializando } = useAuth();

  if (inicializando) {
    return <LoadingIndicator fullscreen texto="Abriendo tu cuenta…" />;
  }

  return (
    <NavigationContainer theme={tema}>
      {usuario ? <AppNavigator /> : <PublicNavigator />}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Root />
        <StatusBar style="dark" />
      </AuthProvider>
    </SafeAreaProvider>
  );
}