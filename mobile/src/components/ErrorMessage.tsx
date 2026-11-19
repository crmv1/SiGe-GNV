import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colores, espaciado, radio } from '../theme';

interface Props {
  mensaje: string;
  onRetry?: () => void;
}

export default function ErrorMessage({ mensaje, onRetry }: Props) {
  return (
    <View style={styles.contenedor}>
      <Text style={styles.icono}>⚠️</Text>
      <Text style={styles.mensaje}>{mensaje}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} style={styles.boton}>
          <Text style={styles.botonTexto}>Reintentar</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    backgroundColor: colores.rojoFondo,
    borderWidth: 1,
    borderColor: colores.rojo,
    borderRadius: radio.md,
    padding: espaciado.lg,
    alignItems: 'center',
    gap: espaciado.sm,
    marginBottom: espaciado.md,
  },
  icono: {
    fontSize: 22,
  },
  mensaje: {
    color: colores.rojo,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 19,
  },
  boton: {
    marginTop: espaciado.xs,
    backgroundColor: colores.rojo,
    paddingHorizontal: espaciado.lg,
    paddingVertical: espaciado.sm,
    borderRadius: radio.sm,
  },
  botonTexto: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});