import { useEffect, useRef, useState } from 'react';
import { cotizador, getProductos } from '../api';
import { calcular } from '../../../src/modules/cotizador/calculo.js';
import { recomendar } from '../../../src/modules/cotizador/recomendacion.js';
import './cotizador.css';

const money = (n) => `${new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2 }).format(n)} Bs`;
const name = (m) => `${m.marca} ${m.modelo}`;
const field = (label, input) => <label>{label}{input}</label>;
const num = (v) => v === '' ? null : Number(v);
const select = (key, label, rows, value, description, initial = '') => field(label,
  <select name={key} defaultValue={initial ?? ''}><option value="">Seleccionar</option>
    {rows.map((r) => <option key={value(r)} value={value(r)}>{description(r)}</option>)}</select>);
const input = (key, label, initial, type = 'text') => field(label, <input name={key} type={type}
  min={type === 'number' ? 0 : undefined} step={type === 'number' ? 'any' : undefined} defaultValue={initial ?? ''} />);

function Form({ title, children, send, convert = (v) => v }) {
  return <form onSubmit={(event) => {
    event.preventDefault();
    send(convert(Object.fromEntries(new FormData(event.currentTarget))));
  }}><strong>{title}</strong><div className="cot-grid">{children}</div><button>Guardar</button></form>;
}

function Catalogo({ d, send, isAdmin }) {
  const [fichaId, setFichaId] = useState('');
  const [productos, setProductos] = useState([]);
  const [inventarioError, setInventarioError] = useState('');
  const f = d.fichas.find((r) => String(r.id) === fichaId) || {};
  return <section className="cot-panel">
    <h2>Catálogo y alternativas</h2>
    {isAdmin && <>
      <Form title="Agregar modelo" send={(v) => send('/modelos','POST',v)}>
        {input('marca','Marca')}{input('modelo','Modelo')}
      </Form>
      {field('Ficha a editar', <select value={fichaId} onChange={(e) => setFichaId(e.target.value)}>
        <option value="">Nueva ficha</option>{d.fichas.map((r) => <option key={r.id} value={r.id}>
          {name(d.modelos.find((m) => m.id === r.modelo_id))} · {r.generacion}</option>)}</select>)}
      <Form key={`${fichaId}-${JSON.stringify(f)}`} title="Ficha por generación" send={(v) => send('/fichas','POST',v)}
        convert={(v) => ({ ...v, id:f.id, modelo_id:num(v.modelo_id), desde:num(v.desde), hasta:num(v.hasta), maletera_l:num(v.maletera_l), verificada:v.verificada === 'on' })}>
        {select('modelo_id','Modelo',d.modelos,(m)=>m.id,name,f.modelo_id)}
        {input('generacion','Generación / variante',f.generacion)}{input('desde','Año inicial',f.desde,'number')}
        {input('hasta','Año final',f.hasta,'number')}{input('carroceria','Carrocería',f.carroceria)}
        {input('maletera_l','Maletera (L)',f.maletera_l,'number')}{input('dimensiones','Dimensiones documentadas (con unidades)',f.dimensiones)}
        {input('codigo_chasis','Código de chasis',f.codigo_chasis)}{input('motorizacion','Motorización',f.motorizacion)}
        {input('mercado','Mercado',f.mercado)}{input('maletera_detalle','Dimensiones y configuración de maletera',f.maletera_detalle)}
        {input('fuente','Fuente y página',f.fuente)}{field('Ficha verificada',<input name="verificada" type="checkbox" defaultChecked={!!f.verificada}/>)}
      </Form>
      <Form title="Configuración comercial" send={(v) => send('/config','PUT',{ ...v, anio_guia:num(v.anio_guia) })}>
        {input('anio_guia','Año de referencia',d.config.anio_guia,'number')}
        {field('Modalidad',<select name="modalidad" defaultValue={d.config.modalidad}>
          <option value="separado">Kit + cilindro</option><option value="kit_incluye_cilindro">El kit incluye cilindro</option></select>)}
      </Form>
      {d.equipos.map((r) => <Form key={r.id} title={r.nombre} send={(v) => send(`/equipos/${r.id}`,'PUT',{ precio:num(v.precio) })}>
        {input('precio','Precio (Bs)',r.precio,'number')}</Form>)}
      <button onClick={async () => {
        try {
          const result = await getProductos();
          setProductos(result.data ?? result.productos ?? []);
          setInventarioError('');
        } catch (e) { setInventarioError(e.message); }
      }}>Consultar productos de inventario</button>
      {inventarioError && <p role="alert">{inventarioError}</p>}
      {productos.length > 0 && <p>{productos.map((p) => `#${p.id_producto} ${p.nombre}`).join(' · ')}</p>}
      {d.cilindros.map((r) => <Form key={r.litros} title={`Cilindro de ${r.litros} L`} send={(v) => send(`/cilindros/${r.litros}`,'PUT',{
        ...v, precio:num(v.precio), producto_id:num(v.producto_id) })}>
        {input('precio','Precio (Bs)',r.precio,'number')}{input('producto_id','ID de producto en inventario',r.producto_id,'number')}
        {input('ficha_oficial','Referencia de ficha oficial',r.ficha_oficial)}{input('datos_verificados','Datos verificados por VC Gas',r.datos_verificados)}
      </Form>)}
    </>}
    <Form title="Registrar alternativa comercial verificada" send={(v) => send('/alternativas','POST',v)}
      convert={(v) => ({ ...v, ficha_id:num(v.ficha_id), equipo_id:num(v.equipo_id), litros:num(v.litros), confirmada:v.confirmada === 'on' })}>
      {select('ficha_id','Ficha verificada con rango de años',d.fichas.filter((r)=>r.verificada && r.desde != null && r.hasta != null),(r)=>r.id,(r)=>`${name(d.modelos.find((m)=>m.id===r.modelo_id))} · ${r.generacion}`)}
      {select('equipo_id','Equipo',d.equipos,(r)=>r.id,(r)=>r.nombre)}
      {select('litros','Cilindro',d.cilindros,(r)=>r.litros,(r)=>`${r.litros} L`)}
      {input('notas','Evidencia de validación técnica')}{field('Confirmo la validación técnica',<input name="confirmada" type="checkbox" required />)}
    </Form>
    {d.alternativas.map((a) => {
      const ficha = d.fichas.find((r) => r.id === a.ficha_id);
      return <p key={a.id}>{name(d.modelos.find((m) => m.id === ficha.modelo_id))} · {ficha.generacion} ·
        equipo {a.equipo_id} / {a.litros} L · {a.notas} <button onClick={()=>send(`/alternativas/${a.id}`,'DELETE')}>Retirar</button></p>;
    })}
  </section>;
}

export default function CotizadorPage({ isAdmin }) {
  const [d, setData] = useState(null);
  const [tab, setTab] = useState('cotizar');
  const [photo, setPhoto] = useState('');
  const [ai, setAI] = useState(null);
  const [identifying, setIdentifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [fichaId, setFichaId] = useState('');
  const [alternative, setAlternative] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [history, setHistory] = useState([]);
  const [more, setMore] = useState(false);
  const image = useRef(null);
  const load = async () => setData(await cotizador());
  useEffect(() => { load().catch((e)=>setMessage(e.message)); }, []);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo); }, [photo]);

  const send = async (path, method, data) => {
    try { setMessage(''); await cotizador(path, method, data); await load(); setMessage('Cambios guardados.'); }
    catch (e) { setMessage(e.message); }
  };
  const getHistory = async (before) => {
    try {
      const rows = await cotizador(`/presupuestos${before ? `?antes=${before}` : ''}`);
      setHistory((h) => before ? [...h,...rows] : rows); setMore(rows.length === 50);
    } catch (e) { setMessage(e.message); }
  };
  const reset = () => { setAlternative(''); setConfirmed(false); };
  const changeModel = (value) => { setModel(value); setFichaId(''); reset(); };
  const loadPhoto = (event) => {
    const f = event.target.files[0];
    if (!f) return;
    event.target.value = '';
    setAI(null); setPhoto(''); changeModel(''); setYear(''); setMessage('');
    if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > 10*1024*1024) {
      setMessage('Formato o tamaño de imagen inválido.'); return;
    }
    setPhoto(URL.createObjectURL(f));
  };
  const fichas = d?.fichas.filter((f) => f.modelo_id === Number(model)) ?? [];
  const vehicle = d?.modelos.find((m) => m.id === Number(model));
  const hasAlternatives = fichas.some((f) => d.alternativas.some((a) => a.ficha_id === f.id));
  const validYear = Number.isInteger(Number(year)) && Number(year) >= 1900 && Number(year) <= new Date().getFullYear()+2;
  const rule = recomendar({ fichas, alternativas:d?.alternativas ?? [], anio:validYear ? Number(year) : NaN,
    anioGuia:d?.config.anio_guia, fichaId:Number(fichaId) });
  const options = rule.opciones;
  const chosen = alternative === '' ? rule.propuesta : options.find((a) => a.id === Number(alternative));
  const kit = d?.equipos.find((r) => r.id === chosen?.equipo_id);
  const cylinder = d?.cilindros.find((r) => r.litros === chosen?.litros);
  const cost = kit && cylinder && calcular(kit.precio, cylinder.precio, d.config.modalidad);
  const optionLabel = (option) => {
    const equipment = d.equipos.find((r) => r.id === option.equipo_id);
    const tank = d.cilindros.find((r) => r.litros === option.litros);
    return `${equipment.nombre} · ${tank.litros} L · ${money(calcular(equipment.precio, tank.precio, d.config.modalidad).total)}`;
  };

  return <div className="cotizador">
    <h1 className="dash-heading">Cotizador Inteligente GNV</h1>
    <p>Presupuesto referencial. No constituye una autorización técnica de instalación.</p>
    <nav aria-label="Secciones del cotizador">
      {[['cotizar','Nueva cotización'],['catalogo','Catálogo y precios'],['historial','Historial']].map(([key,label]) =>
        <button key={key} aria-pressed={tab === key} disabled={saving} onClick={()=>{
          setTab(key); setMessage(''); if(key==='historial') getHistory();
        }}>{label}</button>)}
    </nav>
    {message && <p role="status">{message}</p>}
    {!d ? <button onClick={()=>load().catch((e)=>setMessage(e.message))}>Recargar catálogo</button> : tab === 'catalogo' ?
      <Catalogo d={d} send={send} isAdmin={isAdmin} /> : tab === 'historial' ? <section className="cot-panel">
        <h2>Historial de presupuestos</h2>{!history.length && <p>Sin registros.</p>}
        {history.map(({ id, creado_en, datos:x }) => <p key={id}>#{id} · {new Date(creado_en).toLocaleString('es-BO')} ·
          {name(x)} {x.anio} ({x.generacion?.startsWith('DEMO LOCAL') ? 'prueba histórica' : x.generacion}) · {x.equipo} / {x.litros} L · {money(x.kit)} + {money(x.cilindro)} = <strong>{money(x.total)}</strong></p>)}
        {more && <button onClick={()=>getHistory(history.at(-1)?.id)}>Ver anteriores</button>}
      </section> : <div className="cot-grid cot-workspace">
      <section className="cot-panel">
        <h2>Identificar vehículo</h2>
        <p>Piloto visual: Toyota Corolla y Toyota RAV4. Para otros modelos, usa el catálogo manual.</p>
        {field('Fotografía (JPEG, PNG o WebP, hasta 10 MB)',<input type="file" accept="image/jpeg,image/png,image/webp" disabled={identifying}
          onChange={loadPhoto}/>) }
        {field('Capturar con la cámara del móvil',<input type="file" accept="image/jpeg,image/png,image/webp"
          capture="environment" disabled={identifying} onChange={loadPhoto} />)}
        {photo && <img ref={image} src={photo} alt="Vista previa del vehículo" />}
        <button disabled={!photo || identifying} onClick={async ()=>{
          const img = image.current;
          setIdentifying(true); setAI(null); setMessage('');
          try {
            await img.decode();
            const { identificar } = await import('./cotizadorVision.js');
            const result = await identificar(img);
            setAI(result);
            const suggested = result.accepted && d.modelos.find((r)=>name(r) === result.top[0].label);
            if (suggested) changeModel(String(suggested.id));
          }
          catch (e) { setMessage(e.message); }
          finally { setIdentifying(false); }
        }}>{identifying ? 'Identificando…' : 'Identificar vehículo'}</button>
        {ai && <><p>{ai.accepted ? 'Sugerencias a confirmar' : 'Vehículo no reconocido con suficiente certeza. Selecciónalo manualmente.'} · {ai.ms.toFixed(0)} ms</p>
          <ol>{ai.top.map((x) => {
            const found = d.modelos.find((r)=>name(r) === x.label);
            return <li key={x.label}><button disabled={!found || !ai.accepted} onClick={()=>changeModel(String(found.id))}>
              {x.label} · {(x.score*100).toFixed(1)} %</button></li>;
          })}</ol></>}
        {field('Confirmar o corregir marca y modelo',<select value={model} onChange={(e)=>changeModel(e.target.value)}>
          <option value="">Seleccionar del catálogo</option>{d.modelos.map((r)=><option key={r.id} value={r.id}>{name(r)}</option>)}
        </select>)}
        {model && <><h3>Información referencial de maletera</h3>
          {!fichas.length && <p>Pendiente de verificación para este modelo.</p>}
          {fichas.map((f)=><p key={f.id}><strong>{f.generacion}</strong> · {f.desde ?? '?'}–{f.hasta ?? '?'} · {f.carroceria ?? 'Carrocería pendiente'} ·
            {f.maletera_l == null ? ' Volumen pendiente' : ` ${f.maletera_l} L`} · {f.maletera_detalle ?? 'Detalle de maletera pendiente'} · {f.dimensiones ?? 'Otras dimensiones pendientes'} ·
            {f.codigo_chasis && ` Chasis: ${f.codigo_chasis} ·`}{f.motorizacion && ` Motor: ${f.motorizacion} ·`}{f.mercado && ` Mercado: ${f.mercado} ·`}
            {f.verificada ? ' Verificada' : ' Pendiente de verificación'} · Fuente: {f.fuente ?? 'pendiente'}</p>)}
        </>}
      </section>
      <section className="cot-panel cot-budget">
        <h2>Presupuesto comercial</h2>
        {vehicle ? <p><strong>{name(vehicle)}</strong></p> : <p>Selecciona un vehículo para consultar sus alternativas.</p>}
        {vehicle && field('Año confirmado del vehículo',<input type="number" min="1900" max={new Date().getFullYear()+2}
          placeholder="Ej. 2012" value={year} onChange={(e)=>{setYear(e.target.value); setFichaId(''); reset();}} />)}
        {vehicle && !hasAlternatives && <p className="cot-notice">No hay alternativas comerciales verificadas para {name(vehicle)}. El taller debe validar una ficha y su combinación antes de emitir un presupuesto.</p>}
        {vehicle && hasAlternatives && !validYear && <p className="cot-notice">Confirma el año del vehículo para comprobar las variantes y opciones disponibles.</p>}
        {validYear && hasAlternatives && <p>Guía comercial ({d.config.anio_guia}): {Number(year) === d.config.anio_guia ? 'año de transición; revisar ambos equipos' :
          year < d.config.anio_guia ? 'tercera generación como referencia' : 'quinta generación como referencia'}. El técnico confirma.</p>}
        {rule.aplicables.length > 1 && field('Confirma la variante', <select value={fichaId} onChange={(e)=>{setFichaId(e.target.value); reset();}}>
          <option value="">Seleccionar variante</option>{rule.aplicables.map((f)=><option key={f.id} value={f.id}>{f.generacion} · {f.carroceria ?? 'Carrocería pendiente'}</option>)}
        </select>)}
        {vehicle && hasAlternatives && validYear && !options.length && <p className="cot-notice">{rule.motivo === 'variante' ? 'Confirma la generación o variante para consultar sus alternativas.' : 'No hay alternativas comerciales verificadas para el año y la variante indicados.'}</p>}
        {rule.equipo && <p><strong>Equipo sugerido:</strong> {d.equipos.find((r)=>r.id===rule.equipo)?.nombre} · {rule.motivo === 'guia' ? 'coincide con la guía comercial' : 'según alternativas verificadas por el taller'}.</p>}
        {rule.propuesta && <p>Propuesta automática: {rule.propuesta.litros} L. Puedes elegir otra pareja verificada.</p>}
        {options.length > 0 && field('Seleccionar equipo y cilindro (pareja verificada)',<select value={chosen?.id ?? ''} onChange={(e)=>{setAlternative(e.target.value || 'ninguna'); setConfirmed(false);}}>
          <option value="">Seleccionar alternativa</option>{options.map((a)=><option key={a.id} value={a.id}>
            {optionLabel(a)}
          </option>)}
        </select>)}
        {cost && <><p>{chosen.notas}</p><p>Inventario: {cylinder.producto ? `${cylinder.producto} · ${cylinder.stock_actual} en stock · ${cylinder.estado_producto}` : 'sin vínculo'}</p>
          <p className="cot-total" aria-live="polite">Equipo: {money(cost.kit)}<br/>Cilindro: {money(cost.cilindro)} {cost.modalidad !== 'separado' && '(incluido en el kit)'}<br/>
            <strong>Total estimado: {money(cost.total)}</strong></p>
          {field('Confirmo vehículo, año, equipo y cilindro',<input type="checkbox" checked={confirmed} onChange={(e)=>setConfirmed(e.target.checked)}/>)}
          <button disabled={!confirmed || saving} onClick={async ()=>{
            setSaving(true);
            try {
              const r = await cotizador('/presupuestos','POST',{ modelo_id:Number(model), anio:Number(year), alternativa_id:chosen.id, confirmado:true, total_visto:cost.total });
              setMessage(`Presupuesto #${r.id} guardado.`); setConfirmed(false);
            } catch (e) { setMessage(e.message); setConfirmed(false); await load().catch(()=>{}); }
            finally { setSaving(false); }
          }}>Guardar presupuesto</button>
        </>}
        <section className="cot-price-list" aria-label="Precios de catálogo">
          <h3>Precios de catálogo</h3>
          <p>Importes por componente. El presupuesto depende de una combinación verificada.</p>
          <dl>{d.equipos.map((e) => <div key={e.id}><dt>{e.nombre}</dt><dd>{money(e.precio)}</dd></div>)}
            {d.cilindros.map((c) => <div key={c.litros}><dt>Cilindro de {c.litros} L</dt><dd>{money(c.precio)}</dd></div>)}</dl>
        </section>
      </section>
    </div>}
  </div>;
}
