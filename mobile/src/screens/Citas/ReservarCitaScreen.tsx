import { useEffect, useState } from 'react';
import { View, Text, Button, ScrollView } from 'react-native';
import api from '../../services/api';

export default function ReservarCitaScreen() {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0,10));
  const [vehiculos, setVehiculos] = useState<any[]>([]);
  const [vehiculoId, setVehiculoId] = useState<number|null>(null);
  const [tipo, setTipo] = useState<'inspeccion'|'recalificacion'>('inspeccion');
  const [slots, setSlots] = useState<any[]>([]);
  const [hora, setHora] = useState<string|null>(null);
  useEffect(()=>{
    api.get('/cliente/vehiculos').then(r=>{setVehiculos(r.data.vehiculos||[]); if(r.data.vehiculos?.[0]) setVehiculoId(r.data.vehiculos[0].id);}).catch(()=>{});
  },[]);
  useEffect(()=>{
    if(fecha) api.get('/agenda/disponibilidad?fecha='+fecha).then(r=>setSlots(r.data.slots||[])).catch(()=>{});
  },[fecha]);
  const reservar = async ()=>{
    if(!vehiculoId||!hora) return;
    await api.post('/cliente/citas',{vehiculo_id:vehiculoId,tipo_servicio:tipo,fecha,hora_inicio:hora.slice(0,5)+':00'});
  };
  return (
    <ScrollView style={{padding:16}}>
      <Text style={{fontSize:18,fontWeight:'600'}}>Reservar Cita</Text>
      <Text>Fecha</Text>
      <input type='date' value={fecha} onChange={e=>setFecha(e.target.value)} />
      <Text>Vehiculo</Text>
      {vehiculos.map(v=>(
        <Button key={v.id} title={v.placa} onPress={()=>setVehiculoId(v.id)} />
      ))}
      <Text>Tipo</Text>
      <Button title='inspeccion' onPress={()=>setTipo('inspeccion')} />
      <Button title='recalificacion' onPress={()=>setTipo('recalificacion')} />
      <Text>Horarios</Text>
      {slots.map(s=>(
        <Button key={s.hora_inicio} title={s.hora_inicio} onPress={()=>setHora(s.hora_inicio)} />
      ))}
      <Button title='Confirmar Reserva' onPress={reservar} />
    </ScrollView>
  );
}
