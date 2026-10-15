// src/screens/Citas/ReservarCitaScreen.tsx
// Reserva de cita de RECALIFICACIÓN desde la app del cliente.
//
// El cliente solo puede reservar recalificación (el taller agenda
// inspecciones y otros servicios de forma presencial). Elige
// vehículo, tipo (público/privado), fecha y hora disponible.
//
// El date picker es una tira horizontal de los próximos 14 días:
// sin dependencias nativas, funciona en Expo Go y es más rápido de
// usar que un calendario completo para una reserva.
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import ErrorMessage from '../../components/ErrorMessage';
import LoadingIndicator from '../../components/LoadingIndicator';
import * as citaService from '../../services/citaService';
import * as vehicleService from '../../services/vehicleService';
import { colores, espaciado, radio } from '../../theme';
import type { Vehiculo } from '../../types/vehicle';
import type { AppScreenProps } from '../../navigation/types';

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function fechaLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function proximosDias(n: number): Date[] {
  const out: Date[] = [];
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  for (let i = 0; i < n; i += 1) {
    out.push(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i));
  }
  return out;
}

export default function ReservarCitaScreen({ navigation }: AppScreenProps<'ReservarCita'>) {
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [vehiculoId, setVehiculoId] = useState<number | null>(null);
  const [tipoVeh, setTipoVeh] = useState<'publico' | 'privado'>('privado');
  const [fecha, setFecha] = useState(fechaLocalISO(new Date()));
  const [slots, setSlots] = useState<citaService.DisponibilidadSlot[]>([]);
  const [hora, setHora] = useState<string | null>(null);
  const [cargandoVeh, setCargandoVeh] = useState(true);
  const [cargandoSlots, setCargandoSlots] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  // Carga los vehículos del cliente al entrar.
  useFocusEffect(
    useCallback(() => {
      let vivo = true;
      setCargandoVeh(true);
      vehicleService.getVehiculos()
        .then((r) => {
          if (!vivo) return;
          setVehiculos(r.vehiculos);
          if (r.vehiculos.length > 0) setVehiculoId(r.vehiculos[0].id_vehiculo);
        })
        .catch((e) => { if (vivo) setError(e.message); })
        .finally(() => { if (vivo) setCargandoVeh(false); });
      return () => { vivo = false; };
    }, [])
  );

  // Carga los slots cuando cambia la fecha.
  const cargarSlots = useCallback(async (f: string) => {
    setCargandoSlots(true);
    setHora(null);
    try {
      const r = await citaService.getDisponibilidad(f);
      setSlots(r.slots || []);
    } catch {
      setSlots([]);
    } finally {
      setCargandoSlots(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargarSlots(fecha);
    }, [fecha, cargarSlots])
  );

  const reservar = async () => {
    setError('');
    if (!vehiculoId || !hora) {
      setError('Elige un vehículo y una hora.');
      return;
    }
    setEnviando(true);
    try {
      await citaService.reservarCita({
        vehiculo_id: vehiculoId,
        fecha,
        hora_inicio: hora,
        tipo_vehiculo: tipoVeh,
      });
      navigation.navigate('MisCitas');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo reservar la cita.');
    } finally {
      setEnviando(false);
    }
  };

  const dias = proximosDias(14);
  const slotsDisponibles = slots.filter((s) => s.disponible);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenido}>
      <Text style={styles.titulo}>Reservar cita de recalificación</Text>
      <Text style={styles.subtitulo}>
        El proceso para vehículo público tarda ~3 días; privado termina en el día.
      </Text>

      {error ? <ErrorMessage mensaje={error} /> : null}

      {/* --- Vehículo --- */}
      <Text style={styles.seccion}>Vehículo</Text>
      {cargandoVeh ? (
        <LoadingIndicator texto="Cargando vehículos…" />
      ) : vehiculos.length === 0 ? (
        <Text style={styles.vacio}>No tienes vehículos vinculados.</Text>
      ) : (
        vehiculos.map((v) => (
          <Pressable
            key={v.id_vehiculo}
            style={[styles.opcion, vehiculoId === v.id_vehiculo && styles.opcionOn]}
            onPress={() => setVehiculoId(v.id_vehiculo)}
          >
            <Text style={[styles.opcionTexto, vehiculoId === v.id_vehiculo && styles.opcionTextoOn]}>
              {v.placa}
            </Text>
          </Pressable>
        ))
      )}

      {/* --- Tipo de vehículo --- */}
      <Text style={styles.seccion}>¿Público o privado?</Text>
      <View style={styles.fila}>
        <Pressable
          style={[styles.tipoBtn, tipoVeh === 'privado' && styles.tipoBtnOn]}
          onPress={() => setTipoVeh('privado')}
        >
          <Text style={[styles.tipoTexto, tipoVeh === 'privado' && styles.tipoTextoOn]}>
            Privado
          </Text>
          <Text style={styles.tipoNota}>Termina en el día</Text>
        </Pressable>
        <Pressable
          style={[styles.tipoBtn, tipoVeh === 'publico' && styles.tipoBtnOn]}
          onPress={() => setTipoVeh('publico')}
        >
          <Text style={[styles.tipoTexto, tipoVeh === 'publico' && styles.tipoTextoOn]}>
            Público
          </Text>
          <Text style={styles.tipoNota}>~3 días (tanque a recalificadora)</Text>
        </Pressable>
      </View>

      {/* --- Fecha --- */}
      <Text style={styles.seccion}>Fecha</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tira}>
        {dias.map((d) => {
          const iso = fechaLocalISO(d);
          const seleccionada = iso === fecha;
          return (
            <Pressable
              key={iso}
              style={[styles.diaCelda, seleccionada && styles.diaCeldaOn]}
              onPress={() => setFecha(iso)}
            >
              <Text style={[styles.diaNombre, seleccionada && styles.diaTextoOn]}>
                {DIAS_CORTOS[d.getDay()]}
              </Text>
              <Text style={[styles.diaNumero, seleccionada && styles.diaTextoOn]}>
                {d.getDate()}
              </Text>
              <Text style={[styles.diaMes, seleccionada && styles.diaTextoOn]}>
                {MESES[d.getMonth()]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* --- Hora --- */}
      <Text style={styles.seccion}>Hora disponible</Text>
      {cargandoSlots ? (
        <LoadingIndicator texto="Cargando horarios…" />
      ) : slotsDisponibles.length === 0 ? (
        <Text style={styles.vacio}>No hay horarios disponibles ese día. Prueba otra fecha.</Text>
      ) : (
        <View style={styles.grillaHoras}>
          {slotsDisponibles.map((s) => {
            const h = s.hora_inicio.slice(0, 5);
            const activa = hora === h;
            return (
              <Pressable
                key={h}
                style={[styles.horaBtn, activa && styles.horaBtnOn]}
                onPress={() => setHora(h)}
              >
                <Text style={[styles.horaTexto, activa && styles.horaTextoOn]}>{h}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* --- Confirmar --- */}
      <Pressable
        style={[styles.confirmar, (!vehiculoId || !hora || enviando) && styles.confirmarOff]}
        onPress={reservar}
        disabled={!vehiculoId || !hora || enviando}
      >
        <Text style={styles.confirmarTexto}>
          {enviando ? 'Reservando…' : 'Confirmar reserva'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espaciado.lg, paddingBottom: espaciado.xxl },
  titulo: { fontSize: 20, fontWeight: '700', color: colores.texto },
  subtitulo: { fontSize: 13, color: colores.textoSecundario, marginTop: 4, marginBottom: espaciado.md },
  seccion: { fontSize: 15, fontWeight: '700', color: colores.texto, marginTop: espaciado.lg, marginBottom: espaciado.sm },
  vacio: { fontSize: 14, color: colores.textoSecundario, fontStyle: 'italic' },
  opcion: {
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radio.md,
    padding: espaciado.md,
    marginBottom: espaciado.sm,
  },
  opcionOn: { borderColor: colores.primario, backgroundColor: '#E7F0FE' },
  opcionTexto: { fontSize: 16, color: colores.texto, fontWeight: '600' },
  opcionTextoOn: { color: colores.primario },
  fila: { flexDirection: 'row', gap: espaciado.sm },
  tipoBtn: {
    flex: 1,
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radio.md,
    padding: espaciado.md,
    alignItems: 'center',
  },
  tipoBtnOn: { borderColor: colores.primario, backgroundColor: '#E7F0FE' },
  tipoTexto: { fontSize: 15, fontWeight: '700', color: colores.texto },
  tipoTextoOn: { color: colores.primario },
  tipoNota: { fontSize: 11, color: colores.textoSecundario, marginTop: 2, textAlign: 'center' },
  tira: { gap: espaciado.sm, paddingVertical: 4 },
  diaCelda: {
    width: 56,
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radio.md,
    paddingVertical: espaciado.sm,
    alignItems: 'center',
  },
  diaCeldaOn: { backgroundColor: colores.primario, borderColor: colores.primario },
  diaNombre: { fontSize: 11, color: colores.textoSecundario },
  diaNumero: { fontSize: 20, fontWeight: '700', color: colores.texto },
  diaMes: { fontSize: 10, color: colores.textoSecundario },
  diaTextoOn: { color: '#FFFFFF' },
  grillaHoras: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.sm },
  horaBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radio.md,
  },
  horaBtnOn: { backgroundColor: colores.primario, borderColor: colores.primario },
  horaTexto: { fontSize: 14, fontWeight: '600', color: colores.texto },
  horaTextoOn: { color: '#FFFFFF' },
  confirmar: {
    backgroundColor: colores.primario,
    borderRadius: radio.md,
    paddingVertical: espaciado.md,
    alignItems: 'center',
    marginTop: espaciado.xl,
  },
  confirmarOff: { opacity: 0.5 },
  confirmarTexto: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
