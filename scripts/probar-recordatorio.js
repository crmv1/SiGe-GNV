// Prueba manual del generador de recordatorios.
//
// El job real corre por cron (ver recordatorios.job.js), asi que para
// comprobar que la logica de fechas sirve hay que dispararla a mano.
// Este script no borra nada de la base real: solo imprime el resumen.
import { generarNotificacionesPendientes } from '../src/modules/notificaciones/notificaciones.service.js';
import { query } from '../src/config/database.js';
import { closePool } from '../src/config/database.js';

const resultado = await generarNotificacionesPendientes();
console.log('generarNotificacionesPendientes ->', JSON.stringify(resultado));

const pendientes = await query(
  `SELECT n.id_notificacion, v.placa, n.tipo, n.dias_anticipacion,
          n.fecha_programada, n.estado
     FROM notificaciones n
     JOIN vehiculos v ON v.id = n.id_vehiculo
    WHERE n.estado = 'pendiente'
    ORDER BY n.fecha_programada
    LIMIT 15`
);

console.log(`\npendientes ahora mismo: ${pendientes.length}`);
for (const n of pendientes) {
  const dias = Math.round(
    (new Date(n.fecha_programada) - new Date(new Date().toDateString())) / 86400000
  );
  console.log(
    `  ${n.placa.padEnd(9)} ${n.tipo.padEnd(14)} ${n.dias_anticipacion} dias  ` +
    `programada=${n.fecha_programada}  faltan=${dias}`
  );
}

await closePool();
