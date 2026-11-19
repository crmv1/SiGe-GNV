import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import AppHeader from '../components/AppHeader';
import { useAuth } from '../context/AuthContext';
import { pushRemotoDisponible } from '../services/notificationService';
import type { TabScreenProps } from '../navigation/types';
import { APP_NAME, APP_VERSION, API_URL, USE_MOCK_DATA } from '../config';
import { colores, espaciado, radio } from '../theme';

export default function ProfileScreen(_props: TabScreenProps<'Perfil'>) {
  const { usuario, logout, registrarDispositivo, desactivarPush } = useAuth();
  const [pushActivo, setPushActivo] = useState(false);
  const [pushOcupado, setPushOcupado] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const alternarPush = async (valor: boolean) => {
    // En Expo Go el push remoto no esta disponible (SDK 53+), asi que
    // no se intenta registrar ni tocar expo-notifications remotas.
    if (valor && !pushRemotoDisponible()) {
      setPushActivo(false);
      setPushOcupado(false);
      setMensaje(
        'Los avisos por push no funcionan en Expo Go. Probá con una development build.'
      );
      return;
    }
    setPushOcupado(true);
    setMensaje('');
    try {
      if (valor) {
        const resultado = await registrarDispositivo();
        setPushActivo(resultado.registrado);
        if (!resultado.registrado) {
          setMensaje(
            'No se pudo registrar el teléfono para recibir avisos. Revisá los permisos de notificación.'
          );
        }
      } else {
        await desactivarPush();
        setPushActivo(false);
      }
    } finally {
      setPushOcupado(false);
    }
  };

  const nombreRol =
    usuario?.rol === 'administrador'
      ? 'Administrador'
      : usuario?.rol === 'tecnico'
        ? 'Técnico'
        : 'Cliente';

  return (
    <View style={styles.flex}>
      <AppHeader titulo="Perfil" subtitulo={APP_NAME} />

      <ScrollView contentContainerStyle={styles.contenido}>
        <View style={styles.tarjeta}>
          <Text style={styles.etiqueta}>Usuario</Text>
          <Text style={styles.valor}>{usuario?.username ?? '—'}</Text>
          <Text style={styles.etiqueta}>Rol</Text>
          <Text style={styles.valor}>{nombreRol}</Text>
        </View>

        <View style={styles.tarjeta}>
          <View style={styles.fila}>
            <View style={styles.filaTexto}>
              <Text style={styles.valor}>Avisos por notificación push</Text>
              <Text style={styles.detalle}>
                Recibí un aviso cuando la app esté abierta o cerrada.
              </Text>
            </View>
            <Switch
              value={pushActivo}
              onValueChange={(v) => alternarPush(v)}
              disabled={pushOcupado}
              trackColor={{ true: colores.primario }}
              thumbColor={pushActivo ? '#FFFFFF' : '#F4F4F5'}
            />
          </View>
          {mensaje ? <Text style={styles.mensaje}>{mensaje}</Text> : null}
        </View>

        <View style={styles.tarjeta}>
          <Text style={styles.etiqueta}>Servidor</Text>
          <Text style={styles.valorMono}>{API_URL}</Text>
          <Text style={styles.detalle}>
            {USE_MOCK_DATA ? 'Usando datos de ejemplo (mock)' : 'Conectado al servidor real'}
          </Text>
        </View>

        <Text style={styles.version}>
          {APP_NAME} · versión {APP_VERSION}
        </Text>

        <Pressable style={styles.botonCerrar} onPress={logout}>
          <Text style={styles.botonCerrarTexto}>Cerrar sesión</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  contenido: {
    padding: espaciado.lg,
    paddingBottom: espaciado.xxl,
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
  filaTexto: {
    flex: 1,
  },
  etiqueta: {
    fontSize: 12,
    color: colores.textoSecundario,
    marginBottom: 2,
  },
  valor: {
    fontSize: 16,
    fontWeight: '700',
    color: colores.texto,
    marginBottom: espaciado.sm,
  },
  valorMono: {
    fontSize: 13,
    color: colores.texto,
    marginBottom: espaciado.xs,
  },
  detalle: {
    fontSize: 13,
    color: colores.textoSecundario,
    lineHeight: 18,
    marginBottom: espaciado.xs,
  },
  mensaje: {
    fontSize: 12,
    color: colores.rojo,
    marginTop: espaciado.sm,
  },
  version: {
    fontSize: 12,
    color: colores.textoSecundario,
    textAlign: 'center',
    marginVertical: espaciado.lg,
  },
  botonCerrar: {
    backgroundColor: colores.rojo,
    borderRadius: radio.md,
    paddingVertical: espaciado.md,
    alignItems: 'center',
  },
  botonCerrarTexto: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});