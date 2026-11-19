import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import ErrorMessage from '../components/ErrorMessage';
import LoadingIndicator from '../components/LoadingIndicator';
import StatusBadge from '../components/StatusBadge';
import type { PublicScreenProps } from '../navigation/types';
import * as publicService from '../services/publicService';
import { colores, espaciado, radio } from '../theme';
import type { ConsultaPlaca } from '../types/consulta';
import { formatDate } from '../utils/formatDate';

export default function PlateResultScreen({
  route,
  navigation,
}: PublicScreenProps<'PlateResult'>) {
  const { placa } = route.params;
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<ConsultaPlaca | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    setData(null);
    try {
      const respuesta = await publicService.consultarPlaca(placa);
      setData(respuesta.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ocurrió un error inesperado.');
    } finally {
      setCargando(false);
    }
  }, [placa]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenido}>
      <View style={styles.encabezado}>
        <Text style={styles.placa}>{placa}</Text>
        <Text style={styles.subtitulo}>Resultado de la consulta pública</Text>
      </View>

      {cargando ? <LoadingIndicator texto="Consultando la placa…" /> : null}

      {!cargando && error ? (
        <View>
          <ErrorMessage mensaje={error} onRetry={cargar} />
          <Pressable
            style={styles.boton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.botonTexto}>Consultar otra placa</Text>
          </Pressable>
        </View>
      ) : null}

      {!cargando && !error && data ? (
        <View>
          <View style={styles.tarjeta}>
            <View style={styles.fila}>
              <View style={styles.texto}>
                <Text style={styles.tituloServicio}>Próxima inspección</Text>
                <Text style={styles.fecha}>Vence: {formatDate(data.proxima_inspeccion)}</Text>
              </View>
              <StatusBadge estado={data.estado_inspeccion} />
            </View>
          </View>

          <View style={styles.tarjeta}>
            <View style={styles.fila}>
              <View style={styles.texto}>
                <Text style={styles.tituloServicio}>Próxima recalificación</Text>
                <Text style={styles.fecha}>
                  Vence: {formatDate(data.proxima_recalificacion)}
                </Text>
              </View>
              <StatusBadge estado={data.estado_recalificacion} />
            </View>
          </View>

          <Text style={styles.aviso}>
            La consulta pública muestra únicamente las fechas y estados del vehículo.
            Nunca expone tus datos personales.
          </Text>

          <Pressable style={styles.boton} onPress={() => navigation.navigate('PublicHome')}>
            <Text style={styles.botonTexto}>Consultar otra placa</Text>
          </Pressable>
        </View>
      ) : null}
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
    fontSize: 32,
    fontWeight: '800',
    color: colores.primario,
    letterSpacing: 2,
  },
  subtitulo: {
    fontSize: 13,
    color: colores.textoSecundario,
    marginTop: espaciado.xs,
  },
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
    gap: espaciado.md,
  },
  texto: {
    flex: 1,
  },
  tituloServicio: {
    fontSize: 16,
    fontWeight: '700',
    color: colores.texto,
  },
  fecha: {
    fontSize: 13,
    color: colores.textoSecundario,
    marginTop: 2,
  },
  aviso: {
    fontSize: 12,
    color: colores.textoSecundario,
    lineHeight: 18,
    marginVertical: espaciado.md,
    textAlign: 'center',
  },
  boton: {
    backgroundColor: colores.primario,
    borderRadius: radio.md,
    paddingVertical: espaciado.md,
    alignItems: 'center',
    marginTop: espaciado.sm,
  },
  botonTexto: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});