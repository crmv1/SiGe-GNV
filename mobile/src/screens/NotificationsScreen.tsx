import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AppHeader from '../components/AppHeader';
import ErrorMessage from '../components/ErrorMessage';
import LoadingIndicator from '../components/LoadingIndicator';
import NotificationCard from '../components/NotificationCard';
import type { TabScreenProps } from '../navigation/types';
import * as notificationService from '../services/notificationService';
import { colores, espaciado, radio } from '../theme';
import type { NotificacionesResponse } from '../types/notification';

export default function NotificationsScreen(_props: TabScreenProps<'Avisos'>) {
  const [soloNoLeidas, setSoloNoLeidas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<NotificacionesResponse | null>(null);

  const cargar = useCallback(
    async (modo: 'inicial' | 'refresh' = 'inicial') => {
      if (modo === 'inicial') setCargando(true);
      else setRefrescando(true);
      setError('');
      try {
        setData(await notificationService.listNotificaciones(soloNoLeidas));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudieron cargar los avisos.');
      } finally {
        setCargando(false);
        setRefrescando(false);
      }
    },
    [soloNoLeidas]
  );

  useFocusEffect(
    useCallback(() => {
      cargar('inicial');
    }, [cargar])
  );

  const marcar = async (id: number) => {
    try {
      await notificationService.marcarLeida(id);
      await cargar('refresh');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar el aviso.');
    }
  };

  const notificaciones = data?.notificaciones ?? [];

  return (
    <View style={styles.flex}>
      <AppHeader
        titulo="Avisos"
        subtitulo={data ? `${data.no_leidas} sin leer` : 'Recordatorios del taller'}
      />

      <View style={styles.filtros}>
        <Pressable
          onPress={() => setSoloNoLeidas(false)}
          style={[styles.filtro, !soloNoLeidas && styles.filtroActivo]}
        >
          <Text style={[styles.filtroTexto, !soloNoLeidas && styles.filtroTextoActivo]}>
            Todas
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setSoloNoLeidas(true)}
          style={[styles.filtro, soloNoLeidas && styles.filtroActivo]}
        >
          <Text style={[styles.filtroTexto, soloNoLeidas && styles.filtroTextoActivo]}>
            Sin leer
          </Text>
        </Pressable>
      </View>

      {cargando && !data ? <LoadingIndicator texto="Cargando avisos…" /> : null}

      {error && !data ? (
        <View style={styles.contenido}>
          <ErrorMessage mensaje={error} onRetry={() => cargar()} />
        </View>
      ) : null}

      {data && notificaciones.length === 0 ? (
        <View style={styles.vacio}>
          <Text style={styles.vacioIcono}>🔔</Text>
          <Text style={styles.vacioTitulo}>No hay avisos</Text>
          <Text style={styles.vacioTexto}>
            {soloNoLeidas ? 'No tenés avisos sin leer.' : 'Los recordatorios aparecen acá.'}
          </Text>
        </View>
      ) : null}

      <FlatList
        data={notificaciones}
        keyExtractor={(n) => String(n.id)}
        renderItem={({ item }) => (
          <NotificationCard notificacion={item} onPress={() => marcar(item.id)} />
        )}
        contentContainerStyle={styles.lista}
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            onRefresh={() => cargar('refresh')}
            tintColor={colores.primario}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  contenido: {
    padding: espaciado.lg,
  },
  filtros: {
    flexDirection: 'row',
    gap: espaciado.sm,
    paddingHorizontal: espaciado.lg,
    paddingVertical: espaciado.md,
  },
  filtro: {
    paddingHorizontal: espaciado.lg,
    paddingVertical: espaciado.sm,
    borderRadius: radio.md,
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  filtroActivo: {
    backgroundColor: colores.primario,
    borderColor: colores.primario,
  },
  filtroTexto: {
    fontSize: 14,
    fontWeight: '600',
    color: colores.textoSecundario,
  },
  filtroTextoActivo: {
    color: '#FFFFFF',
  },
  lista: {
    paddingHorizontal: espaciado.lg,
    paddingBottom: espaciado.xxl,
  },
  vacio: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: espaciado.xl,
    gap: espaciado.sm,
  },
  vacioIcono: {
    fontSize: 44,
  },
  vacioTitulo: {
    fontSize: 17,
    fontWeight: '700',
    color: colores.texto,
  },
  vacioTexto: {
    fontSize: 14,
    color: colores.textoSecundario,
    textAlign: 'center',
    lineHeight: 20,
  },
});