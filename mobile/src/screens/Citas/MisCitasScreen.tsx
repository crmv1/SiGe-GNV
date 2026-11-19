// src/screens/Citas/MisCitasScreen.tsx
// Lista las citas del cliente con el badge del estado de proceso
// (Reservada → En taller → Tanque en recalificadora → Montaje y
// prueba → Lista para retiro → Entregada). Los colores y etiquetas
// vienen del backend en `estado_info`, así que la app no
// reimplementa las reglas.
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import ErrorMessage from '../../components/ErrorMessage';
import LoadingIndicator from '../../components/LoadingIndicator';
import * as citaService from '../../services/citaService';
import { colores, espaciado, radio } from '../../theme';
import type { AppScreenProps } from '../../navigation/types';

function fechaLegible(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function BadgeEstado({ info }: { info: citaService.EstadoInfo | null }) {
  if (!info) {
    return (
      <View style={[styles.badge, { backgroundColor: '#9CA3AF' }]}>
        <Text style={styles.badgeTexto}>—</Text>
      </View>
    );
  }
  return (
    <View style={[styles.badge, { backgroundColor: info.color || '#6b7280' }]}>
      <Text style={styles.badgeTexto}>{info.etiqueta}</Text>
    </View>
  );
}

export default function MisCitasScreen({ navigation }: AppScreenProps<'MisCitas'>) {
  const [citas, setCitas] = useState<citaService.Cita[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const r = await citaService.getMisCitas();
      setCitas(r.citas);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar tus citas.');
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  if (cargando && citas.length === 0) {
    return <LoadingIndicator texto="Cargando tus citas…" />;
  }

  if (error && citas.length === 0) {
    return <ErrorMessage mensaje={error} onRetry={cargar} />;
  }

  return (
    <View style={styles.flex}>
      <FlatList
        data={citas}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.lista}
        ListEmptyComponent={
          <View style={styles.vacio}>
            <Text style={styles.vacioTitulo}>No tienes citas todavía</Text>
            <Text style={styles.vacioTexto}>
              Reserva una cita de recalificación desde el botón en la pantalla de inicio.
            </Text>
            <Pressable
              style={styles.botonReservar}
              onPress={() => navigation.navigate('ReservarCita')}
            >
              <Text style={styles.botonReservarTexto}>Reservar cita</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardFecha}>{fechaLegible(item.fecha)}</Text>
              <BadgeEstado info={item.estado_info} />
            </View>
            <Text style={styles.cardHora}>
              {item.hora_inicio?.slice(0, 5)}
              {item.hora_fin ? ` – ${item.hora_fin.slice(0, 5)}` : ''}
            </Text>
            <View style={styles.cardMeta}>
              <Text style={styles.cardPlaca}>{item.placa}</Text>
              {item.tipo_vehiculo && (
                <Text style={[
                  styles.cardTipo,
                  item.tipo_vehiculo === 'publico' ? styles.tipoPublico : styles.tipoPrivado,
                ]}>
                  {item.tipo_vehiculo === 'publico' ? 'Público' : 'Privado'}
                </Text>
              )}
              <Text style={styles.cardServicio}>{item.tipo_servicio}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colores.fondo },
  lista: { padding: espaciado.lg, paddingBottom: espaciado.xxl },
  vacio: { alignItems: 'center', paddingTop: espaciado.xxl },
  vacioTitulo: { fontSize: 17, fontWeight: '700', color: colores.texto },
  vacioTexto: {
    fontSize: 14,
    color: colores.textoSecundario,
    textAlign: 'center',
    marginTop: espaciado.sm,
    paddingHorizontal: espaciado.lg,
  },
  botonReservar: {
    backgroundColor: colores.primario,
    borderRadius: radio.md,
    paddingVertical: espaciado.md,
    paddingHorizontal: espaciado.xl,
    marginTop: espaciado.lg,
  },
  botonReservarTexto: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  card: {
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radio.lg,
    padding: espaciado.md,
    marginBottom: espaciado.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardFecha: { fontSize: 16, fontWeight: '700', color: colores.texto },
  badge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeTexto: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  cardHora: { fontSize: 14, color: colores.primario, fontWeight: '600', marginBottom: 6 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cardPlaca: {
    fontFamily: 'monospace',
    fontSize: 13,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    color: colores.texto,
  },
  cardTipo: { fontSize: 12, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  tipoPublico: { backgroundColor: '#DBEAFE', color: '#1E40AF' },
  tipoPrivado: { backgroundColor: '#D1FAE5', color: '#065F46' },
  cardServicio: { fontSize: 12, color: colores.textoSecundario },
});
