import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import AppHeader from '../components/AppHeader';
import ErrorMessage from '../components/ErrorMessage';
import LoadingIndicator from '../components/LoadingIndicator';
import VehicleCard from '../components/VehicleCard';
import type { TabScreenProps } from '../navigation/types';
import * as vehicleService from '../services/vehicleService';
import { colores, espaciado } from '../theme';
import type { VehiculosResponse } from '../types/vehicle';

export default function MyVehiclesScreen({ navigation }: TabScreenProps<'MisVehiculos'>) {
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<VehiculosResponse | null>(null);

  const cargar = useCallback(async (modo: 'inicial' | 'refresh' = 'inicial') => {
    if (modo === 'inicial') setCargando(true);
    else setRefrescando(true);
    setError('');
    try {
      setData(await vehicleService.getVehiculos());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar tus vehículos.');
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar('inicial');
    }, [cargar])
  );

  const vehiculos = data?.vehiculos ?? [];

  if (cargando && !data) return <LoadingIndicator texto="Cargando tus vehículos…" />;

  return (
    <View style={styles.flex}>
      <AppHeader titulo="Mis vehículos" subtitulo="Inspección y recalificación" />

      {error && !data ? <ErrorMessage mensaje={error} onRetry={() => cargar()} /> : null}

      {data && vehiculos.length === 0 ? (
        <View style={styles.vacio}>
          <Text style={styles.vacioIcono}>🚗</Text>
          <Text style={styles.vacioTitulo}>Todavía no tenés vehículos</Text>
          <Text style={styles.vacioTexto}>
            Cuando el taller te registre un vehículo, lo vas a ver acá junto con sus fechas.
          </Text>
        </View>
      ) : null}

      <FlatList
        data={vehiculos}
        keyExtractor={(v) => String(v.id_vehiculo)}
        renderItem={({ item }) => (
          <VehicleCard
            vehiculo={item}
            onPress={() =>
              navigation.navigate('VehicleDetail', { id: item.id_vehiculo, placa: item.placa })
            }
          />
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
  lista: {
    padding: espaciado.lg,
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