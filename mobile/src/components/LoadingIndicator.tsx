import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colores, espaciado } from '../theme';

interface Props {
  texto?: string;
  fullscreen?: boolean;
}

export default function LoadingIndicator({ texto = 'Cargando…', fullscreen }: Props) {
  return (
    <View style={[styles.contenedor, fullscreen && styles.fullscreen]}>
      <ActivityIndicator size="large" color={colores.primario} />
      <Text style={styles.texto}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    paddingVertical: espaciado.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaciado.md,
  },
  fullscreen: {
    flex: 1,
  },
  texto: {
    fontSize: 14,
    color: colores.textoSecundario,
  },
});