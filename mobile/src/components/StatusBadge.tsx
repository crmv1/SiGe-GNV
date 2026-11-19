import { StyleSheet, Text, View } from 'react-native';
import { colores } from '../theme';
import { etiquetaEstado, type EtiquetaEstado } from '../utils/status';

interface Props {
  estado: string | null | undefined;
}

const COLORES: Record<EtiquetaEstado, { texto: string; fondo: string }> = {
  VIGENTE: { texto: colores.verde, fondo: colores.verdeFondo },
  'PRÓXIMO': { texto: colores.ambar, fondo: colores.ambarFondo },
  VENCIDO: { texto: colores.rojo, fondo: colores.rojoFondo },
  'SIN REGISTRO': { texto: colores.gris, fondo: colores.grisFondo },
};

export default function StatusBadge({ estado }: Props) {
  const etiqueta = etiquetaEstado(estado);
  const paleta = COLORES[etiqueta];
  return (
    <View style={[styles.etiqueta, { backgroundColor: paleta.fondo }]}>
      <Text style={[styles.texto, { color: paleta.texto }]}>{etiqueta}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  etiqueta: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  texto: {
    fontSize: 12,
    fontWeight: '700',
  },
});