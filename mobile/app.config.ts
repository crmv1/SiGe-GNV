import type { ConfigContext, ExpoConfig } from 'expo/config';

// Configuracion dinamica de la app SIGE-GNV VC GAS.
// La URL del backend se pasa por variable de entorno para no
// guardar IPs ni dominios en el codigo fuente: EXPO_PUBLIC_API_URL.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'SIGE-GNV VC GAS',
  slug: 'sige-gnv-vc-gas',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  scheme: 'sigegnv',
  ios: {
    ...config.ios,
    supportsTablet: true,
    bundleIdentifier: 'com.vcgas.sigegnv',
    config: {
      ...config.ios?.config,
      usesNonExemptEncryption: false,
    },
  },
  android: {
    ...config.android,
    package: 'com.vcgas.sigegnv',
    adaptiveIcon: {
      backgroundColor: '#0B5ED7',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    permissions: [
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.INTERNET',
      'android.permission.WAKE_LOCK',
    ],
  },
  plugins: ['expo-secure-store'],
  web: {
    ...config.web,
    favicon: './assets/favicon.png',
  },
});