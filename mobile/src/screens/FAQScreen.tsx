import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AppHeader from '../components/AppHeader';
import type { TabScreenProps } from '../navigation/types';
import { colores, espaciado, radio } from '../theme';

interface FAQ {
  pregunta: string;
  respuesta: string;
}

const PREGUNTAS: FAQ[] = [
  {
    pregunta: '¿Qué es la inspección?',
    respuesta:
      'Es el control anual de tu vehículo. Su vencimiento se calcula como la fecha de la última inspección más 1 año. Cuando está vigente, la próxima fecha se renueva automáticamente.',
  },
  {
    pregunta: '¿Qué es la recalificación?',
    respuesta:
      'Es el control del equipo de gas, que se renueva cada 5 años. Su vencimiento se calcula como la fecha de la última recalificación más 5 años.',
  },
  {
    pregunta: '¿Qué significan los estados?',
    respuesta:
      'VIGENTE: la fecha está al día. PRÓXIMO: falta poco para vencer (10 días o menos). VENCIDO: la fecha ya pasó. SIN REGISTRO: el taller todavía no registró una fecha.',
  },
  {
    pregunta: '¿Cuándo me llegan los recordatorios?',
    respuesta:
      'El taller te avisa 10 días antes de cada vencimiento. Los avisos aparecen en esta app y también pueden llegar por WhatsApp.',
  },
  {
    pregunta: '¿Cómo activo mi cuenta?',
    respuesta:
      'El taller te entrega un código de activación. Con ese código, tu usuario y una contraseña, podés activar la cuenta desde la pantalla “Activar mi cuenta”. El código es de un solo uso.',
  },
  {
    pregunta: '¿Qué ve cualquiera al consultar mi placa?',
    respuesta:
      'Solo las fechas y estados de inspección y recalificación. La consulta pública nunca muestra nombre, teléfono, documento ni dirección.',
  },
];

export default function FAQScreen(_props: TabScreenProps<'FAQ'>) {
  const [abierta, setAbierta] = useState<number | null>(null);

  return (
    <View style={styles.flex}>
      <AppHeader titulo="Preguntas frecuentes" subtitulo="Todo lo que necesitás saber" />
      <ScrollView contentContainerStyle={styles.contenido}>
        {PREGUNTAS.map((item, i) =>
          abierta === i ? (
            <View key={item.pregunta} style={styles.tarjetaAbierta}>
              <Pressable onPress={() => setAbierta(null)}>
                <Text style={styles.pregunta}>{item.pregunta}</Text>
                <Text style={styles.respuesta}>{item.respuesta}</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              key={item.pregunta}
              style={styles.tarjeta}
              onPress={() => setAbierta(i)}
            >
              <Text style={styles.pregunta}>{item.pregunta}</Text>
            </Pressable>
          )
        )}
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
    borderRadius: radio.md,
    padding: espaciado.lg,
    borderWidth: 1,
    borderColor: colores.borde,
    marginBottom: espaciado.sm,
  },
  tarjetaAbierta: {
    backgroundColor: colores.superficie,
    borderRadius: radio.md,
    padding: espaciado.lg,
    borderWidth: 1,
    borderColor: colores.primario,
    marginBottom: espaciado.sm,
  },
  pregunta: {
    fontSize: 15,
    fontWeight: '700',
    color: colores.texto,
  },
  respuesta: {
    fontSize: 14,
    color: colores.textoSecundario,
    marginTop: espaciado.sm,
    lineHeight: 20,
  },
});