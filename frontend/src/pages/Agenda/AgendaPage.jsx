import { useState, useEffect } from 'react';
import api from '../../api.js';

export default function AgendaPage() {
  const [desde, setDesde] = useState(new Date().toISOString().slice(0,10));
  const [hasta, setHasta] = useState(new Date(Date.now()+7*86400000).toISOString().slice(0,10));
  const [citas, setCitas] = useState([]);
  const cargar = async () => {
    const r = await api.get('/citas?desde='+desde+'&hasta='+hasta);
    setCitas(r.data.citas||[]);
  };
  useEffect(()=>{cargar();},[]);
  return (
    <div style={{padding:20}}>
      <h2>Agenda / Citas</h2>
      <input type='date' value={desde} onChange={e=>setDesde(e.target.value)}/>
      <input type='date' value={hasta} onChange={e=>setHasta(e.target.value)}/>
      <button onClick={cargar}>Buscar</button>
      <table style={{width:'100%',marginTop:10,borderCollapse:'collapse'}}>
        <thead><tr><th>Fecha</th><th>Hora</th><th>Cliente</th><th>Placa</th><th>Tipo</th><th>Estado</th></tr></thead>
        <tbody>{citas.map(c=>(
          <tr key={c.id}><td>{c.fecha}</td><td>{c.hora_inicio}</td><td>{c.nombre+' '+c.apellido}</td><td>{c.placa}</td><td>{c.tipo_servicio}</td><td>{c.estado}</td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}
