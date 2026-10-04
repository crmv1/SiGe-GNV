import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colores, espaciado, radio } from '../theme';
import type { Notificacion } from '../types/notification';
import { formatDate } from '../utils/formatDate';

interface Props {
  notificacion: Notificacion;
  onPress?: () => void;
}

export default function NotificationCard({ notificacion, onPress }: Props) {
  const sinLeer = !notificacion.leida;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tarjeta,
        sinLeer && styles.sinLeer,
        pressed && styles.presionada,
      ]}
    >
      <View style={styles.encabezado}>
        <View style={styles.tituloFila}>
          {sinLeer ? <View style={styles.punto} /> : null}
          <Text style={[styles.titulo, sinLeer && styles.tituloSinLeer]} numberOfLines={1}>
            {notificacion.titulo}
          </Text>
        </View>
        <Text style={styles.fecha}>{formatDate(notificacion.fecha)}</Text>
      </View>
      <Text style={styles.mensaje}>{notificacion.mensaje}</Text>
      <View style={styles.pie}>
        <Text style={styles.placa}>{notificacion.vehiculo.placa}</Text>
        <Text style={styles.tipo}>
          {notificacion.tipo === 'inspeccion' ? 'Inspección' : 'Recalificación'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    backgroundColor: colores.superficie,
    borderRadius: radio.lg,
    padding: espaciado.lg,
    borderWidth: 1,
    borderColor: colores.borde,
    marginBottom: espaciado.md,
  },
  sinLeer: {
    borderColor: colores.primario,
    backgroundColor: colores.primarioFondo,
  },
  presionada: {
    opacity: 0.85,
  },
  encabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaciado.sm,
  },
  tituloFila: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaciado.sm,
  },
  punto: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colores.primario,
  },
  titulo: {
    fontSize: 15,
    fontWeight: '600',
    color: colores.textoSecundario,
    flexShrink: 1,
  },
  tituloSinLeer: {
    color: colores.texto,
  },
  fecha: {
    fontSize: 12,
    color: colores.textoSecundario,
  },
  mensaje: {
    fontSize: 13,
    color: colores.texto,
    marginTop: espaciado.sm,
    lineHeight: 18,
  },
  pie: {
    marginTop: espaciado.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  placa: {
    fontSize: 12,
    fontWeight: '700',
    color: colores.primario,
  },
  tipo: {
    fontSize: 12,
    color: colores.textoSecundario,
  },
});