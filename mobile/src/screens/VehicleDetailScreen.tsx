import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import ErrorMessage from '../components/ErrorMessage';
import LoadingIndicator from '../components/LoadingIndicator';
import ServiceCard from '../components/ServiceCard';
import type { AppScreenProps } from '../navigation/types';
import * as citaService from '../services/citaService';
import * as vehicleService from '../services/vehicleService';
import { colores, espaciado, radio } from '../theme';
import type { Vehiculo } from '../types/vehicle';

// Estados que significan "la cita sigue en curso". Cuando una cita
// entra en uno de estos, el vehículo está físicamente en el taller
// o esperando su turno, y el cliente quiere ver en qué va.
const ESTADOS_PROCESO_ACTIVOS = new Set([
  'RESERVADA', 'EN_TALLER', 'TANQUE_EN_RECALIFICADORA',
  'MONTAJE_Y_PRUEBA', 'LISTA_PARA_RETIRO',
]);

export default function VehicleDetailScreen({
  route,
}: AppScreenProps<'VehicleDetail'>) {
  const { id, placa } = route.params;
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [vehiculo, setVehiculo] = useState<Vehiculo | null>(null);
  const [citaActiva, setCitaActiva] = useState<citaService.Cita | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const respuesta = await vehicleService.getVehiculo(id);
      setVehiculo(respuesta.vehiculo);
      // La cita activa de ESTE vehículo (si hay un recalificación
      // en curso). Se consulta aparte; no se carga el detalle del
      // vehículo con ella para no acoplar los dos endpoints.
      try {
        const citas = await citaService.getMisCitas();
        const activa = citas.citas.find(
          (c) => c.vehiculo_id === id && ESTADOS_PROCESO_ACTIVOS.has(c.estado)
        );
        setCitaActiva(activa || null);
      } catch {
        setCitaActiva(null);
      }
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

      {/* Proceso de recalificación en curso (si hay cita activa) */}
      {citaActiva && citaActiva.estado_info ? (
        <View style={styles.procesoCard}>
          <Text style={styles.procesoTitulo}>Recalificación en curso</Text>
          <View style={styles.procesoFila}>
            <View style={[styles.procesoBadge, { backgroundColor: citaActiva.estado_info.color }]}>
              <Text style={styles.procesoBadgeTexto}>{citaActiva.estado_info.etiqueta}</Text>
            </View>
            <Text style={styles.procesoFecha}>
              {citaActiva.fecha.split('-').reverse().join('/')} · {citaActiva.hora_inicio?.slice(0, 5)}
            </Text>
          </View>
          {citaActiva.tipo_vehiculo && (
            <Text style={styles.procesoTipo}>
              Vehículo {citaActiva.tipo_vehiculo === 'publico' ? 'público' : 'privado'}
              {citaActiva.tipo_vehiculo === 'publico'
                ? ' · El proceso tarda ~3 días'
                : ' · Se completa en el día'}
            </Text>
          )}
        </View>
      ) : null}

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
  procesoCard: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: radio.lg,
    padding: espaciado.md,
    marginBottom: espaciado.md,
  },
  procesoTitulo: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E40AF',
    marginBottom: espaciado.sm,
  },
  procesoFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaciado.sm,
  },
  procesoBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  procesoBadgeTexto: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  procesoFecha: { fontSize: 13, color: colores.texto },
  procesoTipo: { fontSize: 12, color: '#1E40AF', marginTop: 4 },
  nota: {
    fontSize: 12,
    color: colores.textoSecundario,
    textAlign: 'center',
    marginTop: espaciado.sm,
  },
});