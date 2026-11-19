export function calcular(kit, cilindro, modalidad) {
  const centavos = (precio) => Math.round(Number(precio) * 100);
  const equipo = centavos(kit);
  const cilindroComercial = centavos(cilindro);
  const cargo = modalidad === 'kit_incluye_cilindro' ? 0 : cilindroComercial;
  return { kit: equipo / 100, cilindro: cargo / 100, precio_catalogo_cilindro: cilindroComercial / 100,
    total: (equipo + cargo) / 100, modalidad };
}
