// ============================================================
//  scripts/seed-proyecciones.mjs
//  Genera datos REALISTAS para que las proyecciones tengan
//  volumen de taller de verdad:
//
//    · ~16 recalificaciones vencen por mes (pipeline futuro)
//    · ~10 conversiones (altas) por mes en el historial (12 meses)
//    · ~8 inspecciones vencen por mes
//    · clientes y vehículos con tipo publico/privado
//    · citas en varios estados del proceso de recalificación
//
//  Correr SIEMPRE contra la base de pruebas:
//    .\scripts\con-3307.ps1 scripts\seed-proyecciones.mjs
// ============================================================
import { query, closePool } from '../src/config/database.js';

const RAND = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[RAND(arr.length)];

// --- Nombres y apellidos bolivianos ---------------------------
const NOMBRES = [
  'Carlos', 'María', 'Juan', 'Ana', 'Luis', 'Rocío', 'Diego', 'Valeria',
  'Miguel', 'Camila', 'Andrés', 'Fernanda', 'Jorge', 'Gabriela', 'Pedro',
  'Luciana', 'Fernando', 'Daniela', 'Raúl', 'Sofía', 'Óscar', 'Andrea',
  'Marco', 'Paula', 'Edwin', 'Karla', 'Rodrigo', 'Natalia', 'Héctor',
  'Alejandra', 'Iván', 'Mónica', 'Gonzalo', 'Patricia', 'René', 'Sandra',
  'Julio', 'Tania', 'Mauricio', 'Elena', 'Alberto', 'Rosa', 'Felipe',
  'Jazmín', 'Eduardo', 'Carla', 'Gustavo', 'Adriana', 'Ricardo', 'Micaela',
];
const APELLIDOS = [
  'Vargas', 'Mamani', 'Quispe', 'Flores', 'Rojas', 'González', 'Torrez',
  'Cruz', 'Huanca', 'Condori', 'Choque', 'Salazar', 'Paredes', 'Álvarez',
  'Ramírez', 'Fernández', 'López', 'García', 'Martínez', 'Herrera',
  'Sánchez', 'Rivera', 'Castro', 'Ortiz', 'Silva', 'Vega', 'Mendoza',
  'Peñaranda', 'Ávila', 'Zárate', 'Cáceres', 'Navarro', 'Ibáñez',
  'Beltrán', 'Escobar', 'Miranda', 'Ríos', 'Guerrero', 'Delgado',
  'Padilla', 'Arce', 'Bustamante', 'Carrasco', 'Dávalos', 'Echeverría',
];

// Placa boliviana: 1-4 números + 3 letras (sin I, O, U para no confundir).
const LETRAS_PLACA = 'ABCDEFGHJKLMNPQRSTVWXYZ';
function generarPlaca() {
  const nums = 1 + RAND(4);
  let placa = '';
  for (let i = 0; i < nums; i += 1) placa += String(RAND(10));
  for (let i = 0; i < 3; i += 1) placa += LETRAS_PLACA[RAND(LETRAS_PLACA.length)];
  return placa;
}

function telefono() {
  return '591' + String(60000000 + RAND(39999999));
}

// --- Fechas ----------------------------------------------------
function isoLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function sumarMeses(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function sumarDias(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

// ============================================================
//  Main
// ============================================================
async function main() {
  console.log('\n  Generando datos de proyecciones para la 3307...\n');

  const hoy = new Date();

  // Si ya hay vehículos sembrados (de una corrida anterior),
  // no se duplican: solo se agregan las citas que falten.
  const vehExistentes = (await query('SELECT COUNT(*) AS total FROM vehiculos'))[0].total;
  const yaHayDatos = vehExistentes > 10;

  if (yaHayDatos) {
    console.log(`  Ya hay ${vehExistentes} vehículos en la base. No se duplican.`);
    console.log('  Solo se verificarán las citas.\n');
  }

  // --------------------------------------------------------
  //  1. Clientes + vehículos (solo si no existen)
  // --------------------------------------------------------
  const TOTAL = 240;
  const clientesCreados = [];
  const vehiculosCreados = [];

  // Fechas futuras de recalificación: 16 por mes × 12 meses = 192.
  // El resto (48) quedan con fecha más lejana (13-18 meses).
  const fechasRecal = [];
  for (let mes = 0; mes < 12; mes += 1) {
    const base = sumarMeses(hoy, mes + 1); // mes siguiente en adelante
    for (let k = 0; k < 16; k += 1) {
      const dia = 1 + RAND(28);
      fechasRecal.push(new Date(base.getFullYear(), base.getMonth(), dia));
    }
  }
  // 48 extras más lejanos.
  for (let k = 0; k < 48; k += 1) {
    const base = sumarMeses(hoy, 13 + RAND(6));
    const dia = 1 + RAND(28);
    fechasRecal.push(new Date(base.getFullYear(), base.getMonth(), dia));
  }

  // Fechas de inspección: ~8 por mes × 12 = 96. El resto se
  // reparte en meses adicionales.
  const fechasInsp = [];
  for (let mes = 0; mes < 12; mes += 1) {
    const base = sumarMeses(hoy, mes + 1);
    for (let k = 0; k < 8; k += 1) {
      const dia = 1 + RAND(28);
      fechasInsp.push(new Date(base.getFullYear(), base.getMonth(), dia));
    }
  }
  for (let k = 0; k < TOTAL - fechasInsp.length; k += 1) {
    const base = sumarMeses(hoy, 13 + RAND(10));
    const dia = 1 + RAND(28);
    fechasInsp.push(new Date(base.getFullYear(), base.getMonth(), dia));
  }

  // Fechas de alta (created_at): ~20 por mes × 12 = 240.
  const fechasAlta = [];
  for (let mes = 0; mes < 12; mes += 1) {
    const base = sumarMeses(hoy, -mes); // mes actual hacia atrás
    for (let k = 0; k < 20; k += 1) {
      const dia = 1 + RAND(27);
      const hora = 8 + RAND(10);
      fechasAlta.push(new Date(base.getFullYear(), base.getMonth(), dia, hora, RAND(60)));
    }
  }

  // Shuffle para que no queden todos los públicos juntos.
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = RAND(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  shuffle(fechasRecal);
  shuffle(fechasInsp);
  shuffle(fechasAlta);

  if (!yaHayDatos) {
    console.log(`  Insertando ${TOTAL} clientes y vehículos...`);

    for (let i = 0; i < TOTAL; i += 1) {
      const nombre = pick(NOMBRES);
      const apellido = pick(APELLIDOS);
      const tel = telefono();
      const placa = generarPlaca();
    // 30% público, 70% privado.
    const tipo = Math.random() < 0.3 ? 'publico' : 'privado';

    const fechaRecal = fechasRecal[i] || sumarMeses(hoy, 24 + RAND(24));
    const fechaInsp = fechasInsp[i] || sumarMeses(hoy, 13 + RAND(12));
    const fechaAlta = fechasAlta[i] || sumarDias(hoy, -RAND(365));

    // Cliente
    const rc = await query(
      'INSERT INTO clientes (nombre, apellido, telefono, created_at, updated_at) VALUES (?,?,?,?,NOW())',
      [nombre, apellido, tel, fechaAlta]
    );
    const clienteId = rc.insertId;
    clientesCreados.push(clienteId);

    // Vehículo
    const rv = await query(
      `INSERT INTO vehiculos
         (nombre, apellido, placa, tipo_vehiculo, fecha_recalificacion, fecha_inspeccion,
          telefono, id_cliente, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,NOW())`,
      [nombre, apellido, placa, tipo, isoLocal(fechaRecal), isoLocal(fechaInsp), tel, clienteId, fechaAlta]
    );
    vehiculosCreados.push({ id: rv.insertId, clienteId, fechaRecal: isoLocal(fechaRecal), tipo });
    }

    console.log(`    ✓ ${clientesCreados.length} clientes`);
    console.log(`    ✓ ${vehiculosCreados.length} vehículos`);
  } else {
    // Ya hay vehículos: se cargan los existentes para las citas.
    const filas = await query(
      'SELECT id, id_cliente, tipo_vehiculo FROM vehiculos WHERE id_cliente IS NOT NULL'
    );
    for (const f of filas) {
      vehiculosCreados.push({
        id: f.id,
        clienteId: f.id_cliente,
        tipo: f.tipo_vehiculo || 'privado',
      });
    }
  }

  // --------------------------------------------------------
  //  2. Citas en varios estados del proceso
  //
  //  Se crean ~60 citas repartidas en los estados:
  //    RESERVADA (próximas), EN_TALLER, TANQUE_EN_RECALIFICADORA,
  //    MONTAJE_Y_PRUEBA, LISTA_PARA_RETIRO, ENTREGADA (históricas),
  //    y algunas CANCELADA / NO_ASISTIO.
  // --------------------------------------------------------
  const ESTADOS_PROCESO = [
    'EN_TALLER', 'TANQUE_EN_RECALIFICADORA', 'MONTAJE_Y_PRUEBA', 'LISTA_PARA_RETIRO',
  ];
  const TOTAL_CITAS = 60;
  let citasCreadas = 0;

  console.log(`  Insertando ~${TOTAL_CITAS} citas en varios estados...`);

  // Mezclar los vehículos para elegir al azar.
  const vehiculosMezclados = shuffle([...vehiculosCreados]);

  for (let i = 0; i < TOTAL_CITAS && i < vehiculosMezclados.length; i += 1) {
    const v = vehiculosMezclados[i];
    // 40% en proceso activo, 25% reservadas, 20% entregadas, 15% excepcionales.
    const r = Math.random();
    let estado, diasOffset;
    if (r < 0.40) {
      estado = pick(ESTADOS_PROCESO);
      diasOffset = -RAND(10); // hace poco
    } else if (r < 0.65) {
      estado = 'RESERVADA';
      diasOffset = 1 + RAND(21); // próximas
    } else if (r < 0.85) {
      estado = 'ENTREGADA';
      diasOffset = -(15 + RAND(60)); // históricas
    } else if (r < 0.93) {
      estado = 'CANCELADA';
      diasOffset = -(5 + RAND(30));
    } else {
      estado = 'NO_ASISTIO';
      diasOffset = -(5 + RAND(30));
    }

    const fechaCita = sumarDias(hoy, diasOffset);
    const hora = 8 + RAND(9);
    const horaInicio = `${String(hora).padStart(2, '0')}:00:00`;
    const horaFin = `${String(hora + 1).padStart(2, '0')}:00:00`;
    const origen = Math.random() < 0.5 ? 'movil' : 'web';

    try {
      await query(
        `INSERT INTO citas
           (cliente_id, vehiculo_id, tipo_servicio, tipo_vehiculo, fecha, hora_inicio, hora_fin,
            estado, origen, creado_por, observaciones, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
        [v.clienteId, v.id, 'recalificacion', v.tipo, isoLocal(fechaCita),
         horaInicio, horaFin, estado, origen, 6, 'Seed de proyecciones']
      );
      citasCreadas += 1;
    } catch (e) {
      // Si falla por índice único u otra restricción, se ignora.
      if (i === 0) console.error('    (primer INSERT de citas falló):', e.message);
    }
  }

  console.log(`    ✓ ${citasCreadas} citas creadas`);

  // --------------------------------------------------------
  //  3. Resumen de lo que quedó cargado
  // --------------------------------------------------------
  const veh = (await query('SELECT COUNT(*) AS total FROM vehiculos'))[0];
  const cli = (await query('SELECT COUNT(*) AS total FROM clientes'))[0];
  const cit = (await query('SELECT COUNT(*) AS total FROM citas'))[0];
  const pub = (await query("SELECT COUNT(*) AS total FROM vehiculos WHERE tipo_vehiculo='publico'"))[0];
  const priv = (await query("SELECT COUNT(*) AS total FROM vehiculos WHERE tipo_vehiculo='privado'"))[0];

  // Recalificaciones por mes futuro (próximos 6 meses).
  const recal = await query(
    `SELECT DATE_FORMAT(fecha_recalificacion, '%Y-%m') AS mes, COUNT(*) AS total
       FROM vehiculos
      WHERE fecha_recalificacion >= CURDATE()
      GROUP BY mes ORDER BY mes LIMIT 6`
  );

  console.log('\n  ──── Resumen ────');
  console.log(`  Clientes:              ${cli.total}`);
  console.log(`  Vehículos:             ${veh.total}  (públicos: ${pub.total}, privados: ${priv.total})`);
  console.log(`  Citas:                 ${cit.total}`);
  console.log('\n  Recalificaciones que vencen por mes (próximos 6):');
  for (const r of recal) {
    const barra = '█'.repeat(Math.min(r.total, 40));
    console.log(`    ${r.mes}: ${String(r.total).padStart(2)} ${barra}`);
  }

  // Conversiones por mes histórico (últimos 6).
  const conv = await query(
    `SELECT DATE_FORMAT(created_at, '%Y-%m') AS mes, COUNT(*) AS total
       FROM vehiculos
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
      GROUP BY mes ORDER BY mes`
  );
  console.log('\n  Conversiones (altas) por mes histórico (últimos 6):');
  for (const c of conv) {
    const barra = '█'.repeat(Math.min(c.total, 40));
    console.log(`    ${c.mes}: ${String(c.total).padStart(2)} ${barra}`);
  }

  await closePool();
  console.log('\n  [OK] Datos de proyecciones cargados.\n');
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
