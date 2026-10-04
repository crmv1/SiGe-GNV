import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, Text, View } from 'react-native';
import { colores, espaciado } from '../theme';

interface Props {
  titulo: string;
  subtitulo?: string;
}

export default function AppHeader({ titulo, subtitulo }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.contenedor, { paddingTop: insets.top + espaciado.md }]}>
      <Text style={styles.titulo}>{titulo}</Text>
      {subtitulo ? <Text style={styles.subtitulo}>{subtitulo}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    backgroundColor: colores.superficie,
    paddingHorizontal: espaciado.lg,
    paddingBottom: espaciado.md,
    borderBottomWidth: 1,
    borderBottomColor: colores.borde,
  },
  titulo: {
    fontSize: 22,
    fontWeight: '700',
    color: colores.texto,
  },
  subtitulo: {
    fontSize: 13,
    color: colores.textoSecundario,
    marginTop: 2,
  },
});