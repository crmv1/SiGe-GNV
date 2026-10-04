import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colores, espaciado, radio } from '../theme';

interface Props extends TextInputProps {
  label: string;
  error?: string;
}

export default function FormTextInput({ label, error, style, ...props }: Props) {
  return (
    <View style={styles.contenedor}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colores.textoSecundario}
        style={[styles.input, error ? styles.inputError : null, style]}
        {...props}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    marginBottom: espaciado.md,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colores.texto,
    marginBottom: espaciado.xs,
  },
  input: {
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radio.md,
    paddingHorizontal: espaciado.md,
    paddingVertical: espaciado.sm + 2,
    fontSize: 16,
    color: colores.texto,
  },
  inputError: {
    borderColor: colores.rojo,
  },
  error: {
    fontSize: 12,
    color: colores.rojo,
    marginTop: 2,
  },
});