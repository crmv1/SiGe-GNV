import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AppHeader from '../components/AppHeader';
import FormTextInput from '../components/FormTextInput';
import type { PublicScreenProps } from '../navigation/types';
import { colores, espaciado, radio } from '../theme';
import { errorDePlaca, normalizePlate } from '../utils/normalizePlate';

export default function PublicHomeScreen({ navigation }: PublicScreenProps<'PublicHome'>) {
  const [placa, setPlaca] = useState('');
  const [error, setError] = useState('');

  const consultar = () => {
    const mensaje = errorDePlaca(placa);
    if (mensaje) {
      setError(mensaje);
      return;
    }
    setError('');
    navigation.navigate('PlateResult', { placa: normalizePlate(placa) });
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AppHeader titulo="SIGE-GNV VC GAS" subtitulo="Consulta tus fechas y estados de tu vehículo" />
      <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.heroTitulo}>Consulta por placa</Text>
          <Text style={styles.heroTexto}>
            Ingresa tu placa para ver cuándo vence tu inspección y tu recalificación.
          </Text>
        </View>

        <View style={styles.buscador}>
          <FormTextInput
            label="Placa"
            value={placa}
            onChangeText={(t) => {
              setPlaca(t);
              if (error) setError('');
            }}
            placeholder="Ej: 1234ABC"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={20}
            error={error}
            onSubmitEditing={consultar}
          />
          <Pressable style={styles.botonPrimario} onPress={consultar}>
            <Text style={styles.botonPrimarioTexto}>Consultar</Text>
          </Pressable>
        </View>

        <View style={styles.separador}>
          <View style={styles.linea} />
          <Text style={styles.separadorTexto}>o</Text>
          <View style={styles.linea} />
        </View>

        <View style={styles.acciones}>
          <Pressable
            style={styles.botonSecundario}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.botonSecundarioTexto}>Iniciar sesión</Text>
          </Pressable>
          <Pressable
            style={styles.botonEnlace}
            onPress={() => navigation.navigate('Activate')}
          >
            <Text style={styles.botonEnlaceTexto}>
              ¿Tienes un código del taller? Activá tu cuenta
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  contenido: {
    padding: espaciado.lg,
    paddingBottom: espaciado.xxl,
  },
  hero: {
    marginBottom: espaciado.xl,
  },
  heroTitulo: {
    fontSize: 24,
    fontWeight: '800',
    color: colores.texto,
  },
  heroTexto: {
    fontSize: 14,
    color: colores.textoSecundario,
    marginTop: espaciado.sm,
    lineHeight: 20,
  },
  buscador: {
    backgroundColor: colores.superficie,
    borderRadius: radio.lg,
    padding: espaciado.lg,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  botonPrimario: {
    backgroundColor: colores.primario,
    borderRadius: radio.md,
    paddingVertical: espaciado.md,
    alignItems: 'center',
  },
  botonPrimarioTexto: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  separador: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaciado.md,
    marginVertical: espaciado.xl,
  },
  linea: {
    flex: 1,
    height: 1,
    backgroundColor: colores.borde,
  },
  separadorTexto: {
    color: colores.textoSecundario,
  },
  acciones: {
    gap: espaciado.md,
  },
  botonSecundario: {
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.primario,
    borderRadius: radio.md,
    paddingVertical: espaciado.md,
    alignItems: 'center',
  },
  botonSecundarioTexto: {
    color: colores.primario,
    fontSize: 16,
    fontWeight: '700',
  },
  botonEnlace: {
    alignItems: 'center',
    paddingVertical: espaciado.sm,
  },
  botonEnlaceTexto: {
    color: colores.primario,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});