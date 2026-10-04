import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AppHeader from '../components/AppHeader';
import ErrorMessage from '../components/ErrorMessage';
import LoadingIndicator from '../components/LoadingIndicator';
import StatusBadge from '../components/StatusBadge';
import type { TabScreenProps } from '../navigation/types';
import * as vehicleService from '../services/vehicleService';
import { colores, espaciado, radio } from '../theme';
import type { ServicioVehiculo, VehiculosResponse } from '../types/vehicle';
import { formatDate } from '../utils/formatDate';

export default function HomeScreen({ navigation }: TabScreenProps<'Inicio'>) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<VehiculosResponse | null>(null);
  const cargado = useRef(false);

  const cargar = useCallback(async (forzar = false) => {
    if (cargado.current && !forzar) return;
    setCargando(true);
    setError('');
    try {
      const respuesta = await vehicleService.getVehiculos();
      setData(respuesta);
      cargado.current = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar tus vehículos.');
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  const nombre = data?.cliente?.nombre ?? '';
  const vehiculos = data?.vehiculos ?? [];

  const proximo = (() => {
    const opciones: Array<{ nombre: string; s: ServicioVehiculo }> = [
      { nombre: 'Inspección', s: vehiculos[0]?.inspeccion },
      { nombre: 'Recalificación', s: vehiculos[0]?.recalificacion },
    ].filter((o): o is { nombre: string; s: ServicioVehiculo } => Boolean(o.s));
    let mejor: { nombre: string; s: ServicioVehiculo } | null = null;
    for (const o of opciones) {
      if (o.s.dias_restantes == null) continue;
      if (!mejor || o.s.dias_restantes < (mejor.s.dias_restantes ?? Infinity)) mejor = o;
    }
    return mejor;
  })();

  return (
    <View style={styles.flex}>
      <AppHeader titulo="Mi cuenta" subtitulo={nombre ? `Hola, ${nombre}` : undefined} />

      {cargando && !data ? <LoadingIndicator texto="Cargando tus vehículos…" /> : null}

      {!cargando && error && !data ? <ErrorMessage mensaje={error} onRetry={() => cargar()} /> : null}

      {data ? (
        <ScrollView contentContainerStyle={styles.contenido}>
          {!data.vinculado ? (
            <View style={styles.tarjetaAviso}>
              <Text style={styles.tarjetaAvisoTitulo}>Todavía no estás vinculado</Text>
              <Text style={styles.tarjetaAvisoTexto}>
                El taller debe confirmar tu cuenta. Pedile tu código de activación para
                ver tus vehículos aquí.
              </Text>
            </View>
          ) : (
            <View>
              <View style={styles.resumen}>
                <View style={styles.numero}>
                  <Text style={styles.numeroValor}>{vehiculos.length}</Text>
                  <Text style={styles.numeroEtiqueta}>
                    {vehiculos.length === 1 ? 'vehículo' : 'vehículos'}
                  </Text>
                </View>

                {proximo ? (
                  <View style={styles.proximo}>
                    <Text style={styles.proximoEtiqueta}>Próximo vencimiento</Text>
                    <Text style={styles.proximoNombre}>{proximo.nombre}</Text>
                    <Text style={styles.proximoFecha}>
                      {formatDate(proximo.s.fecha_vencimiento)}
                    </Text>
                    <View style={styles.proximoBadge}>
                      <StatusBadge estado={proximo.s.estado} />
                    </View>
                  </View>
                ) : null}
              </View>

              <Pressable
                style={styles.boton}
                onPress={() => navigation.navigate('MisVehiculos')}
              >
                <Text style={styles.botonTexto}>Ver mis vehículos</Text>
              </Pressable>

              <Text style={styles.nota}>
                Los estados los calcula el taller: inspección = fecha realizada + 1 año,
                recalificación = fecha realizada + 5 años, y los avisos llegan 10 días antes.
              </Text>
            </View>
          )}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  contenido: {
    padding: espaciado.lg,
    paddingBottom: espaciado.xxl,
  },
  tarjetaAviso: {
    backgroundColor: colores.ambarFondo,
    borderWidth: 1,
    borderColor: colores.ambar,
    borderRadius: radio.lg,
    padding: espaciado.lg,
  },
  tarjetaAvisoTitulo: {
    fontSize: 16,
    fontWeight: '700',
    color: colores.ambar,
  },
  tarjetaAvisoTexto: {
    fontSize: 14,
    color: colores.texto,
    marginTop: espaciado.sm,
    lineHeight: 20,
  },
  resumen: {
    flexDirection: 'row',
    gap: espaciado.md,
    marginBottom: espaciado.lg,
  },
  numero: {
    flex: 1,
    backgroundColor: colores.primario,
    borderRadius: radio.lg,
    padding: espaciado.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numeroValor: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  numeroEtiqueta: {
    fontSize: 13,
    color: '#E7F0FE',
  },
  proximo: {
    flex: 2,
    backgroundColor: colores.superficie,
    borderRadius: radio.lg,
    padding: espaciado.lg,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  proximoEtiqueta: {
    fontSize: 12,
    color: colores.textoSecundario,
  },
  proximoNombre: {
    fontSize: 16,
    fontWeight: '700',
    color: colores.texto,
    marginTop: 2,
  },
  proximoFecha: {
    fontSize: 14,
    color: colores.texto,
    marginTop: 2,
  },
  proximoBadge: {
    marginTop: espaciado.sm,
  },
  boton: {
    backgroundColor: colores.primario,
    borderRadius: radio.md,
    paddingVertical: espaciado.md,
    alignItems: 'center',
  },
  botonTexto: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  nota: {
    fontSize: 12,
    color: colores.textoSecundario,
    lineHeight: 17,
    marginTop: espaciado.lg,
    textAlign: 'center',
  },
});