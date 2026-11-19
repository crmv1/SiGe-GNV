export function recomendar({ fichas, alternativas, anio, anioGuia, fichaId }) {
  const aplicables = fichas.filter((f) => f.verificada && f.desde != null && f.hasta != null && anio >= f.desde && anio <= f.hasta);
  const ficha = fichaId ? aplicables.find((f) => f.id === fichaId) : aplicables.length === 1 ? aplicables[0] : null;
  if (!ficha) return { aplicables, opciones: [], propuesta: null, motivo: aplicables.length ? 'variante' : 'sin_ficha' };
  const opciones = alternativas.filter((a) => a.ficha_id === ficha.id);
  const guia = anio === anioGuia ? null : anio < anioGuia ? 3 : 5;
  const preferidas = opciones.filter((a) => a.equipo_id === guia);
  const candidatas = preferidas.length ? preferidas : opciones;
  const equipos = [...new Set(candidatas.map((a) => a.equipo_id))];
  return {
    aplicables, opciones, equipo: equipos.length === 1 ? equipos[0] : null,
    propuesta: candidatas.length === 1 ? candidatas[0] : null,
    motivo: !opciones.length ? 'sin_alternativa' : preferidas.length ? 'guia' : guia == null ? 'transicion' : 'excepcion',
  };
}
