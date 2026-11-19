import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';
import FormTextInput from '../components/FormTextInput';
import LoadingIndicator from '../components/LoadingIndicator';
import { useAuth } from '../context/AuthContext';
import type { PublicScreenProps } from '../navigation/types';
import { colores, espaciado, radio } from '../theme';

export default function LoginScreen({ navigation }: PublicScreenProps<'Login'>) {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!username.trim() || !password) {
      setError('Ingresa tu usuario y tu contraseña.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await login(username, password);
      // Al establecer la sesion, App.tsx cambia a AppNavigator solo.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.contenido}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.titulo}>Ingresa con tu usuario</Text>
        <Text style={styles.subtitulo}>
          El usuario te lo entrega el taller junto con tu código de activación.
        </Text>

        <FormTextInput
          label="Usuario"
          value={username}
          onChangeText={(t) => {
            setUsername(t);
            if (error) setError('');
          }}
          placeholder="ej: juan.perez"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <FormTextInput
          label="Contraseña"
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            if (error) setError('');
          }}
          placeholder="Tu contraseña"
          secureTextEntry
          onSubmitEditing={submit}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.boton} onPress={submit} disabled={busy}>
          {busy ? <LoadingIndicator /> : <Text style={styles.botonTexto}>Ingresar</Text>}
        </Pressable>

        <Pressable onPress={() => navigation.navigate('Activate')} style={styles.enlace}>
          <Text style={styles.enlaceTexto}>
            ¿No tenés cuenta todavía? Activá tu cuenta con el código del taller
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  contenido: {
    padding: espaciado.lg,
    paddingTop: espaciado.xl,
    paddingBottom: espaciado.xxl,
  },
  titulo: {
    fontSize: 22,
    fontWeight: '800',
    color: colores.texto,
  },
  subtitulo: {
    fontSize: 14,
    color: colores.textoSecundario,
    marginTop: espaciado.sm,
    marginBottom: espaciado.lg,
    lineHeight: 20,
  },
  error: {
    color: colores.rojo,
    fontSize: 13,
    marginBottom: espaciado.md,
  },
  boton: {
    backgroundColor: colores.primario,
    borderRadius: radio.md,
    paddingVertical: espaciado.md,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  botonTexto: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  enlace: {
    marginTop: espaciado.lg,
    alignItems: 'center',
    paddingVertical: espaciado.sm,
  },
  enlaceTexto: {
    color: colores.primario,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});