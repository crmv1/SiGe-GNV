const base = new URL(`${import.meta.env.BASE_URL}cotizador-modelo/`, window.location.origin);
let pending;

async function load() {
  const response = await fetch(new URL('metadata.json', base), { mode: 'same-origin' });
  if (!response.ok) throw new Error('No hay un modelo entrenado publicado. Selecciona el vehículo manualmente.');
  const meta = await response.json().catch(() => null);
  if (meta?.version !== 2 || meta.size !== 224 || !Array.isArray(meta.labels) || meta.labels.length < 3 || meta.labels.length > 31 ||
      !meta.labels.includes('__desconocido__') || new Set(meta.labels).size !== meta.labels.length ||
      !meta.labels.every((label) => typeof label === 'string' && label.trim()) ||
      ![meta.threshold,meta.margin].every((v) => Number.isFinite(v) && v > 0 && v <= 1)) {
    throw new Error('No hay un modelo entrenado compatible. Selecciona el vehículo manualmente.');
  }
  const tf = await import('@tensorflow/tfjs');
  // La prueba de paridad del piloto detectó resultados distintos con WebGL.
  await tf.setBackend('cpu');
  await tf.ready();
  // Restringimos también la descarga de los shards indicados por model.json.
  const model = await tf.loadLayersModel(new URL('model.json', base).href, {
    fetchFunc: (url, init) => fetch(url, { ...init, mode: 'same-origin', redirect: 'error' }),
  });
  return { tf, model, meta };
}

export async function identificar(image) {
  pending ??= load().catch((error) => { pending = undefined; throw error; });
  const { tf, model, meta } = await pending;
  const start = performance.now();
  const out = tf.tidy(() => {
    const scaled = tf.image.resizeBilinear(tf.browser.fromPixels(image), [meta.size, meta.size], false, true);
    return model.predict(scaled.toFloat().div(127.5).sub(1).expandDims());
  });
  try {
    const scores = await out.data();
    if (scores.length !== meta.labels.length || !scores.every(Number.isFinite)) throw new Error('Salida del modelo incompatible.');
    const ranked = Array.from(scores, (score, i) => ({ score, label: meta.labels[i] })).sort((a,b)=>b.score-a.score);
    const accepted = ranked[0].label !== '__desconocido__' && ranked[0].score >= meta.threshold && ranked[0].score-ranked[1].score >= meta.margin;
    const top = ranked.filter((x)=>x.label !== '__desconocido__').slice(0,3);
    return { top, accepted, ms:performance.now()-start };
  } finally { out.dispose(); }
}
