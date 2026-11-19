import { StyleSheet, Text, View } from 'react-native';
import { colores, espaciado, radio } from '../theme';
import type { ServicioVehiculo } from '../types/vehicle';
import { formatDate, formatDiasRestantes } from '../utils/formatDate';
import StatusBadge from './StatusBadge';

interface Props {
  titulo: string;
  detalle?: string;
  servicio: ServicioVehiculo;
}

export default function ServiceCard({ titulo, detalle, servicio }: Props) {
  return (
    <View style={styles.tarjeta}>
      <View style={styles.fila}>
        <Text style={styles.titulo}>{titulo}</Text>
        <StatusBadge estado={servicio.estado} />
      </View>
      {detalle ? <Text style={styles.detalle}>{detalle}</Text> : null}
      <View style={styles.red}>
        <View style={styles.celda}>
          <Text style={styles.etiqueta}>Realizada</Text>
          <Text style={styles.valor}>{formatDate(servicio.fecha_realizada)}</Text>
        </View>
        <View style={styles.celda}>
          <Text style={styles.etiqueta}>Vencimiento</Text>
          <Text style={styles.valor}>{formatDate(servicio.fecha_vencimiento)}</Text>
        </View>
        <View style={styles.celda}>
          <Text style={styles.etiqueta}>Días</Text>
          <Text style={styles.valor}>{formatDiasRestantes(servicio.dias_restantes)}</Text>
        </View>
      </View>
    </View>
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
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titulo: {
    fontSize: 17,
    fontWeight: '700',
    color: colores.texto,
  },
  detalle: {
    fontSize: 13,
    color: colores.textoSecundario,
    marginTop: 2,
  },
  red: {
    flexDirection: 'row',
    marginTop: espaciado.md,
    gap: espaciado.sm,
  },
  celda: {
    flex: 1,
    backgroundColor: colores.fondo,
    borderRadius: radio.sm,
    padding: espaciado.sm,
  },
  etiqueta: {
    fontSize: 11,
    color: colores.textoSecundario,
    marginBottom: 2,
  },
  valor: {
    fontSize: 13,
    fontWeight: '600',
    color: colores.texto,
  },
});