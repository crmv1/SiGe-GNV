import { useEffect, useState } from 'react';
import { View, Text, FlatList } from 'react-native';
import api from '../../services/api';

export default function MisCitasScreen() {
  const [citas, setCitas] = useState<any[]>([]);
  useEffect(() => {
    api.get('/cliente/mis-citas').then(r => setCitas(r.data.citas||[])).catch(()=>{});
  }, []);
  return (
    <View style={{flex:1,padding:16}}>
      <Text style={{fontSize:18,fontWeight:'600'}}>Mis Citas</Text>
      <FlatList
        data={citas}
        keyExtractor={i=>String(i.id)}
        renderItem={({item})=>(
          <View style={{padding:12,borderBottomWidth:1}}>
            <Text>{item.fecha} {item.hora_inicio}-{item.hora_fin}</Text>
            <Text>{item.tipo_servicio} - {item.estado}</Text>
            <Text>{item.placa}</Text>
          </View>
        )}
      />
    </View>
  );
}
