import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import ErrorMessage from '../components/ErrorMessage';
import LoadingIndicator from '../components/LoadingIndicator';
import ServiceCard from '../components/ServiceCard';
import type { AppScreenProps } from '../navigation/types';
import * as vehicleService from '../services/vehicleService';
import { colores, espaciado } from '../theme';
import type { Vehiculo } from '../types/vehicle';

export default function VehicleDetailScreen({
  route,
}: AppScreenProps<'VehicleDetail'>) {
  const { id, placa } = route.params;
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [vehiculo, setVehiculo] = useState<Vehiculo | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const respuesta = await vehicleService.getVehiculo(id);
      setVehiculo(respuesta.vehiculo);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el vehículo.');
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (cargando && !vehiculo) {
    return <LoadingIndicator texto="Cargando el detalle…" />;
  }

  if (error && !vehiculo) {
    return (
      <View style={styles.flex}>
        <ScrollView contentContainerStyle={styles.contenido}>
          <ErrorMessage mensaje={error} onRetry={cargar} />
        </ScrollView>
      </View>
    );
  }

  if (!vehiculo) return null;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenido}>
      <View style={styles.encabezado}>
        <Text style={styles.placa}>{placa}</Text>
        <Text style={styles.subtitulo}>Fechas de tu vehículo</Text>
      </View>

      <ServiceCard
        titulo="Inspección"
        detalle="Se renueva cada año: fecha realizada + 1 año"
        servicio={vehiculo.inspeccion}
      />
      <ServiceCard
        titulo="Recalificación"
        detalle="Se renueva cada 5 años: fecha realizada + 5 años"
        servicio={vehiculo.recalificacion}
      />

      <Text style={styles.nota}>
        Los recordatorios te llegan 10 días antes de cada vencimiento.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  contenido: {
    padding: espaciado.lg,
    paddingBottom: espaciado.xxl,
  },
  encabezado: {
    marginBottom: espaciado.lg,
    alignItems: 'center',
  },
  placa: {
    fontSize: 30,
    fontWeight: '800',
    color: colores.primario,
    letterSpacing: 2,
  },
  subtitulo: {
    fontSize: 13,
    color: colores.textoSecundario,
    marginTop: espaciado.xs,
  },
  nota: {
    fontSize: 12,
    color: colores.textoSecundario,
    textAlign: 'center',
    marginTop: espaciado.sm,
  },
});