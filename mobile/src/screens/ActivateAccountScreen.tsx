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

export default function ActivateAccountScreen({ navigation }: PublicScreenProps<'Activate'>) {
  const { activar } = useAuth();
  const [username, setUsername] = useState('');
  const [codigo, setCodigo] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const validar = (): string => {
    if (!username.trim()) return 'Escribe tu usuario.';
    if (!codigo.trim()) return 'Escribe el código de activación que te dio el taller.';
    if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
    if (password !== confirm) return 'Las contraseñas no coinciden.';
    return '';
  };

  const submit = async () => {
    const problema = validar();
    if (problema) {
      setError(problema);
      return;
    }
    setError('');
    setBusy(true);
    try {
      // El backend normaliza el codigo (minusculas y sin guion).
      await activar(username, codigo, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo activar la cuenta.');
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
        <Text style={styles.titulo}>Activar mi cuenta</Text>
        <Text style={styles.subtitulo}>
          El taller te entregó un código de activación. Con él creas tu usuario y contraseña.
        </Text>

        <FormTextInput
          label="Usuario que quieres usar"
          value={username}
          onChangeText={(t) => {
            setUsername(t);
            if (error) setError('');
          }}
          placeholder="ej: carlos.mamani"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <FormTextInput
          label="Código de activación"
          value={codigo}
          onChangeText={(t) => {
            setCodigo(t);
            if (error) setError('');
          }}
          placeholder="ej: 7KM3Q-98WD2"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={20}
        />
        <FormTextInput
          label="Contraseña"
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            if (error) setError('');
          }}
          placeholder="Mínimo 8 caracteres"
          secureTextEntry
        />
        <FormTextInput
          label="Confirmar contraseña"
          value={confirm}
          onChangeText={(t) => {
            setConfirm(t);
            if (error) setError('');
          }}
          placeholder="Repetí la contraseña"
          secureTextEntry
          onSubmitEditing={submit}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.boton} onPress={submit} disabled={busy}>
          {busy ? <LoadingIndicator /> : <Text style={styles.botonTexto}>Activar cuenta</Text>}
        </Pressable>

        <Pressable onPress={() => navigation.navigate('Login')} style={styles.enlace}>
          <Text style={styles.enlaceTexto}>¿Ya tenés cuenta? Iniciá sesión</Text>
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
  },
});