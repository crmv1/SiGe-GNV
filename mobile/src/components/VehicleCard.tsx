import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colores, espaciado, radio } from '../theme';
import type { Vehiculo } from '../types/vehicle';
import { formatDate } from '../utils/formatDate';
import StatusBadge from './StatusBadge';

interface Props {
  vehiculo: Vehiculo;
  onPress?: () => void;
}

export default function VehicleCard({ vehiculo, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tarjeta, pressed && styles.presionada]}
    >
      <View style={styles.encabezado}>
        <Text style={styles.placa}>{vehiculo.placa}</Text>
        <View style={styles.servicios}>
          <View style={styles.servicioFila}>
            <Text style={styles.servicioNombre}>Inspección</Text>
            <StatusBadge estado={vehiculo.inspeccion.estado} />
          </View>
          <View style={styles.servicioFila}>
            <Text style={styles.servicioNombre}>Recalificación</Text>
            <StatusBadge estado={vehiculo.recalificacion.estado} />
          </View>
        </View>
      </View>
      <View style={styles.pie}>
        <Text style={styles.fecha}>
          Insp. {formatDate(vehiculo.inspeccion.fecha_realizada)} →{' '}
          {formatDate(vehiculo.inspeccion.fecha_vencimiento)}
        </Text>
        <Text style={styles.fecha}>
          Recal. {formatDate(vehiculo.recalificacion.fecha_realizada)} →{' '}
          {formatDate(vehiculo.recalificacion.fecha_vencimiento)}
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
  presionada: {
    opacity: 0.85,
  },
  encabezado: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  placa: {
    fontSize: 20,
    fontWeight: '800',
    color: colores.primario,
    letterSpacing: 1,
  },
  servicios: {
    alignItems: 'flex-end',
    gap: espaciado.xs,
  },
  servicioFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaciado.sm,
  },
  servicioNombre: {
    fontSize: 12,
    color: colores.textoSecundario,
  },
  pie: {
    marginTop: espaciado.md,
    borderTopWidth: 1,
    borderTopColor: colores.borde,
    paddingTop: espaciado.sm,
    gap: 2,
  },
  fecha: {
    fontSize: 12,
    color: colores.textoSecundario,
  },
});