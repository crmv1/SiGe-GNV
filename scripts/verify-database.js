#!/usr/bin/env node
// ============================================================
//  scripts/verify-database.js
//  Verificacion de la migracion.
//
//  Es de SOLO LECTURA. No inserta, no actualiza y no borra
//  ninguna fila: ni de vehiculos, ni de inventario, ni de nada.
//  Se puede correr contra la base de produccion sin riesgo.
//
//  Muestra UNICAMENTE conteos y estructura. Nunca imprime:
//    nombres, telefonos, CI, correos ni ningun dato personal.
//    En inventario, codigo y nombre de producto: son datos del
//    taller, no de personas.
//
//  Tambien revisa:
//    - claves foraneas y si hay registros huerfanos
//    - indices unicos
//    - tablas que falten
//    - inventario: conteos, stock minimo y si el stock guardado
//      cuadra con los movimientos historicos. Si no cuadra, lo
//      muestra y NO lo corrige.
//    - que NO queden estructuras de cilindro (tabla `cilindros`,
//      `vehiculos.id_cilindro`, `capacidad_litros`, `montaje`),
//    - los precios de parametro que la IA usa para cotizar. Las
//      claves y el numero de capacidades salen del propio modulo
//      de IA, asi que el aviso no se queda viejo: avisa si falta
//      la mano de obra, que es el dato que no se puede sustituir,
//      y lista que capacidades de cilindro ya tienen precio.
//
//  Con `--estricto` sale con codigo 1 si encuentra cualquier
//  problema, para poder usarse como puerta de una migracion.
//  Sin el, sale sempre con 0 y solo informa.
//
//  Uso:  npm run db:verify
//        npm run db:verify -- --estricto
// ============================================================
import {
  query,
  closePool,
  checkConnection,
  getServerInfo,
} from '../src/config/database.js';

const ESTRICTO = process.argv.includes('--estricto');

function linea() {
  console.log('-'.repeat(52));
}

// Todo lo que este script considera "problema". Con --estricto,
// que haya alguno hace que el proceso termine con codigo 1.
const problemas = [];

function problema(texto) {
  problemas.push(texto);
  return texto;
}

/** Tablas de las que se espera encontrar conteo. */
const TABLAS = [
  'usuarios',
  'vehiculos',
  'recordatorios_enviados',
  'notificaciones',
  'codigos_activacion',
  'dispositivos_push',
  'inventario_productos',
  'movimientos_inventario',
  'parametros_precios',
  // Las de la normalizacion 009. Van aparte del bloque de
  // inventario porque las usa la app movil del cliente.
  'clientes',
  'inspecciones',
  'recalificaciones',
];

/**
 * Estructuras de cilindro que NO deben existir.
 *
 * El cilindro no es una entidad del taller. La 011 las retiro, y
 * este bloque avisa si alguna volvio a aparecer: seria un signo de
 * que se reaplico una migracion vieja o de que alguien las creo
 * a mano.
 *
 * No es un error que pueda romperse con datos: se verifica por
 * catalogo (`information_schema`), sin leer filas.
 *
 * Se consulta una sola vez, al empezar, y el resultado se imprime
 * al final: asi lo que se anuncia y lo que se comparo con
 * `ESTADO_INICIAL` son el mismo objeto, no dos consultas que
 * puedan diferir.
 */
let PROHIBIDAS = [];

async function buscarProhibidas() {
  PROHIBIDAS = await query(
    `SELECT 'TABLA' AS tipo, TABLE_NAME AS tabla, '' AS columna
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'cilindros'
      UNION ALL
     SELECT 'COLUMNA' AS tipo, TABLE_NAME AS tabla, COLUMN_NAME AS columna
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND (TABLE_NAME = 'vehiculos' AND COLUMN_NAME = 'id_cilindro'
          OR TABLE_NAME = 'inventario_productos'
             AND COLUMN_NAME IN ('capacidad_litros', 'montaje'))`
  );

  return PROHIBIDAS;
}

async function main() {
  linea();
  console.log('  VERIFICACION DE LA MIGRACION');
  linea();

  const estado = await checkConnection();

  if (!estado.connected) {
    console.log('  [ERROR] Sin conexion con MariaDB. No se puede verificar.');
    linea();
    process.exit(1);
  }

  const info = await getServerInfo();
  console.log(`  Motor   : ${info.version}`);
  console.log(`  Base    : ${info.db}`);
  linea();

  // ------------------------------------------------------------
  // 1. Conteos
  // ------------------------------------------------------------
  console.log('  CONTEO DE REGISTROS');
  console.log('');

  const existentes = new Set(
    (
      await query(
        `SELECT TABLE_NAME AS tabla
           FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`
      )
    ).map((r) => r.tabla)
  );

  // Se lee una vez, acÃ¡. Las columnas de cilindro ya no se
  // verifican mas adelante: ahora lo que importa es que NO
  // existan, y eso se comprueba con `buscarProhibidas()`.
  await buscarProhibidas();

  for (const tabla of TABLAS) {
    if (!existentes.has(tabla)) {
      console.log(`  ${tabla.padEnd(24)} : (no existe)`);
      continue;
    }

    const filas = await query(`SELECT COUNT(*) AS n FROM \`${tabla}\``);
    console.log(`  ${tabla.padEnd(24)} : ${filas[0].n}`);
  }

  console.log('');

  // ------------------------------------------------------------
  // 2. Tablas que no estaban en la lista esperada
  // ------------------------------------------------------------
  const extra = [...existentes].filter((t) => !TABLAS.includes(t)).sort();

  if (extra.length > 0) {
    console.log('  OTRAS TABLAS EN LA BASE');
    for (const t of extra) console.log(`    - ${t}`);
    console.log('');
  }

  // ------------------------------------------------------------
  // 3. Claves foraneas
  // ------------------------------------------------------------
  console.log('  CLAVES FORANEAS');
  console.log('');

  // `UPDATE_RULE` y `DELETE_RULE` no estan en KEY_COLUMN_USAGE:
  // viven en REFERENTIAL_CONSTRAINTS. Hay que unir las dos, o la
  // consulta falla con ER_BAD_FIELD_ERROR.
  const fks = await query(
    `SELECT k.TABLE_NAME              AS tabla,
            k.COLUMN_NAME             AS columna,
            k.CONSTRAINT_NAME         AS nombre,
            k.REFERENCED_TABLE_NAME   AS referencia,
            r.UPDATE_RULE             AS on_update,
            r.DELETE_RULE             AS on_delete
       FROM information_schema.KEY_COLUMN_USAGE k
       LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS r
              ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
             AND r.CONSTRAINT_NAME   = k.CONSTRAINT_NAME
             AND r.TABLE_NAME         = k.TABLE_NAME
      WHERE k.TABLE_SCHEMA = DATABASE()
        AND k.REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME`
  );

  if (fks.length === 0) {
    console.log('    (ninguna)');
  } else {
    for (const fk of fks) {
      console.log(
        `    ${fk.tabla}.${fk.columna} -> ${fk.referencia}  (${fk.nombre}, ON DELETE ${fk.on_delete})`
      );
    }
  }

  console.log('');

  // ------------------------------------------------------------
  // 4. Registros huerfanos
  // ------------------------------------------------------------
  console.log('  REGISTROS HUERFANOS');
  console.log('');

  let huerfanos = 0;

  if (existentes.has('recordatorios_enviados') && existentes.has('vehiculos')) {
    const r = await query(
      `SELECT COUNT(*) AS n
         FROM recordatorios_enviados re
         LEFT JOIN vehiculos v ON v.id = re.vehiculo_id
        WHERE v.id IS NULL`
    );
    console.log(`  recordatorios_enviados sin vehiculo   : ${r[0].n}`);
    huerfanos += r[0].n;
  }

  if (existentes.has('notificaciones') && existentes.has('vehiculos')) {
    const r = await query(
      `SELECT COUNT(*) AS n
         FROM notificaciones nt
         LEFT JOIN vehiculos v ON v.id = nt.id_vehiculo
        WHERE v.id IS NULL`
    );
    console.log(`  notificaciones sin vehiculo          : ${r[0].n}`);
    huerfanos += r[0].n;
  }

  if (existentes.has('dispositivos_push') && existentes.has('usuarios')) {
    const r = await query(
      `SELECT COUNT(*) AS n
         FROM dispositivos_push dp
         LEFT JOIN usuarios u ON u.id = dp.id_usuario
        WHERE u.id IS NULL`
    );
    console.log(`  dispositivos_push sin usuario        : ${r[0].n}`);
    huerfanos += r[0].n;
  }

  if (existentes.has('codigos_activacion') && existentes.has('usuarios')) {
    const r = await query(
      `SELECT COUNT(*) AS n
         FROM codigos_activacion ca
         LEFT JOIN usuarios u ON u.id = ca.id_usuario
        WHERE ca.id_usuario IS NOT NULL AND u.id IS NULL`
    );
    console.log(`  codigos_activacion sin usuario       : ${r[0].n}`);
    huerfanos += r[0].n;
  }

  if (existentes.has('movimientos_inventario') && existentes.has('inventario_productos')) {
    const r = await query(
      `SELECT COUNT(*) AS n
         FROM movimientos_inventario m
         LEFT JOIN inventario_productos p ON p.id_producto = m.id_producto
        WHERE p.id_producto IS NULL`
    );
    console.log(`  movimientos sin producto             : ${r[0].n}`);
    huerfanos += r[0].n;
  }

  if (existentes.has('movimientos_inventario') && existentes.has('usuarios')) {
    const r = await query(
      `SELECT COUNT(*) AS n
         FROM movimientos_inventario m
         LEFT JOIN usuarios u ON u.id = m.id_usuario
        WHERE u.id IS NULL`
    );
    console.log(`  movimientos sin usuario              : ${r[0].n}`);
    huerfanos += r[0].n;
  }

  if (huerfanos === 0) {
    console.log('    (sin huerfanos)');
  }

  console.log('');

  // ------------------------------------------------------------
  // 5. Unicidad e integridad
  // ------------------------------------------------------------
  console.log('  INTEGRIDAD');
  console.log('');

  if (existentes.has('vehiculos')) {
    const dup = await query(
      'SELECT COUNT(*) AS n FROM (SELECT placa FROM vehiculos GROUP BY placa HAVING COUNT(*) > 1) x'
    );
    console.log(`  placas duplicadas                     : ${dup[0].n}`);

    const vacias = await query(
      "SELECT COUNT(*) AS n FROM vehiculos WHERE placa = '' OR telefono = ''"
    );
    console.log(`  vehiculos con placa o telefono vacio : ${vacias[0].n}`);
  }

  if (existentes.has('usuarios')) {
    const plains = await query(
      "SELECT COUNT(*) AS n FROM usuarios WHERE password NOT LIKE '$2%'"
    );
    console.log(`  usuarios sin hash bcrypt              : ${plains[0].n}`);
    if (plains[0].n > 0) {
      problema('usuarios con la contrasena en claro o con un hash que no es bcrypt');
      console.log('    AVISO: esas cuentas no podran autenticarse en la API.');
    }

    // requireAdmin y requireStaff comparan contra una lista cerrada
    // de roles. Un rol mal escrito (un espacio, un 'Tecnico' con
    // mayuscula) no da error en la base: simplemente nadie puede
    // entrar, ni como admin ni como tecnico, y no se ve por que.
    const roles = await query(
      `SELECT rol, COUNT(*) AS n
         FROM usuarios
        WHERE rol IS NULL OR rol NOT IN ('administrador', 'tecnico', 'cliente')
        GROUP BY rol`
    );
    if (roles.length > 0) {
      for (const r of roles) {
        console.log(`  usuarios con rol invalido             : ${r.n} ("${r.rol}")`);
      }
      problema(`usuarios con un rol fuera de la lista permitida: ${roles.map((r) => r.rol).join(', ')}`);
      console.log('    AVISO: esos usuarios no podran usar ningun endpoint protegido.');
    } else {
      console.log('  usuarios con rol invalido             : 0');
    }
  }

  if (existentes.has('notificaciones')) {
    const dup = await query(
      `SELECT COUNT(*) AS n FROM (
         SELECT id_vehiculo, tipo, dias_anticipacion, fecha_programada
           FROM notificaciones
          GROUP BY id_vehiculo, tipo, dias_anticipacion, fecha_programada
         HAVING COUNT(*) > 1
       ) x`
    );
    console.log(`  notificaciones duplicadas            : ${dup[0].n}`);
  }

  // ------------------------------------------------------------
  // 5b. Normalizacion cliente-vehiculo y fechas
  //
  //  Esto es lo que sostiene la app movil. Si algo aqui esta mal,
  //  el cliente ve "sin vehiculos" o vencimientos equivocados, y
  //  ninguno de los dos errores se ven desde el panel del taller.
  // ------------------------------------------------------------
  console.log('  NORMALIZACION CLIENTE / VEHICULO');
  console.log('');

  if (!existentes.has('clientes')) {
    console.log('  clientes                           : (no existe)');
    console.log('    Falta aplicar database/migrations/009_normalizar_cliente_vehiculo.sql');
    console.log('    Sin esta tabla la app movil no tiene nada que mostrar.');
    console.log('');
  } else {
    const clientes = await query(
      `SELECT
         COUNT(*)                                                       AS total,
         COALESCE(SUM(CASE WHEN id_usuario IS NOT NULL THEN 1 ELSE 0 END), 0) AS con_cuenta,
         COALESCE(SUM(CASE WHEN id_usuario IS NULL     THEN 1 ELSE 0 END), 0) AS sin_cuenta,
         COALESCE(SUM(CASE WHEN telefono IS NULL OR telefono = '' THEN 1 ELSE 0 END), 0) AS sin_telefono
       FROM clientes`
    );
    const cl = clientes[0];
    console.log(`  clientes                            : ${cl.total}`);
    console.log(`  con cuenta de usuario               : ${cl.con_cuenta}`);
    console.log(`  todavia sin cuenta (pueden activarse) : ${cl.sin_cuenta}`);
    if (cl.sin_telefono > 0) {
      console.log(`  clientes sin telefono               : ${cl.sin_telefono}`);
      console.log('    AVISO: sin telefono no se les puede emitir un codigo de activacion.');
    }

    // Un vehiculo sin cliente no aparece en la app movil, por muy
    // bien guardado que este. Es la causa mas comun de "no veo mi
    // vehiculo", asi que se cuenta aparte.
    if (existentes.has('vehiculos')) {
      const huerfanosDeCliente = await query(
        `SELECT COUNT(*) AS n
           FROM vehiculos v
          WHERE v.id_cliente IS NULL`
      );
      console.log(`  vehiculos sin cliente vinculado      : ${huerfanosDeCliente[0].n}`);
      if (huerfanosDeCliente[0].n > 0) {
        console.log('    AVISO: esos vehiculos NO salen en la app movil del cliente.');
        console.log('    Se arregla volviendo a guardar el vehiculo desde el panel.');
      }
      // NO se suma a `huerfanos`, a proposito. Un huerfano es una
      // fila que APUNTA a algo que no existe. Aqui la FK esta en
      // NULL: no apunta a nadie, y un NULL es valido. Es un dato
      // que falta, no una fila rota, asi que es AVISO y no un
      // problema que haga fallar `--estricto`.

      const clientesHuerfanos = await query(
        `SELECT COUNT(*) AS n
           FROM clientes c
          WHERE NOT EXISTS (SELECT 1 FROM vehiculos v WHERE v.id_cliente = c.id)`
      );
      console.log(`  clientes sin ningun vehiculo         : ${clientesHuerfanos[0].n}`);
    }

    // Dos cuentas distintas para el mismo cliente, y clientes que
    // apuntan a un usuario inexistente. La red anti-carrera del
    // activador evita lo primero, pero si la base ya se toco a
    // mano conviene verlo.
    if (existentes.has('vehiculos')) {
      // Un cliente con UN vehiculo es lo normal, asi que esto es un
      // conteo informativo y no un error.
      const conVehiculos = await query(
        `SELECT COUNT(DISTINCT id_cliente) AS n
           FROM vehiculos
          WHERE id_cliente IS NOT NULL`
      );
      console.log(`  clientes con vehiculos               : ${conVehiculos[0].n}`);

      // Un cliente apuntando a un id de usuario que no existe deja
      // la app movil sin nada que mostrar, y ni el panel del taller
      // ni el cliente ven de donde viene el fallo.
      const usuariosHuerfanos = await query(
        `SELECT COUNT(*) AS n
           FROM clientes c
          LEFT JOIN usuarios u ON u.id = c.id_usuario
          WHERE c.id_usuario IS NOT NULL AND u.id IS NULL`
      );
      console.log(`  clientes con usuario inexistente     : ${usuariosHuerfanos[0].n}`);
      if (usuariosHuerfanos[0].n > 0) {
        problema('clientes.id_usuario apunta a un usuario que no existe');
        console.log('    AVISO: esos clientes no pueden entrar a la app movil.');
      }

      // Un vehiculo apuntando a un cliente inexistente.
      const clientesHuerfanos = await query(
        `SELECT COUNT(*) AS n
           FROM vehiculos v
          LEFT JOIN clientes c ON c.id = v.id_cliente
          WHERE v.id_cliente IS NOT NULL AND c.id IS NULL`
      );
      console.log(`  vehiculos con cliente inexistente   : ${clientesHuerfanos[0].n}`);
      if (clientesHuerfanos[0].n > 0) {
        problema('vehiculos.id_cliente apunta a un cliente que no existe');
      }

      // Un cliente con MAS DE UNA cuenta de usuario. No se consulta
      // sobre `vehiculos` porque el vehiculo no guarda la cuenta:
      // la cuenta vive en `clientes.id_usuario`. Dos filas de
      // `clientes` apuntando al mismo usuario, en cambio, si es un
      // error: dos fichas de persona usando la misma cuenta.
      if (existentes.has('usuarios')) {
        const cuentasCompartidas = await query(
          `SELECT COUNT(*) AS n FROM (
             SELECT id_usuario
               FROM clientes
              WHERE id_usuario IS NOT NULL
              GROUP BY id_usuario
             HAVING COUNT(*) > 1
           ) x`
        );
        console.log(`  cuentas usadas por varios clientes     : ${cuentasCompartidas[0].n}`);
        if (cuentasCompartidas[0].n > 0) {
          problema('una misma cuenta de usuario esta vinculada a mas de un cliente');
          console.log('    AVISO: los dos clientes verian los vehiculos del mismo lado.');
        }
      }
    }
  }

  console.log('');

  // ------------------------------------------------------------
  // 5c. Fechas: la real manda, el vencimiento se deriva
  // ------------------------------------------------------------
  console.log('  FECHAS REALES Y VENCIMIENTOS');
  console.log('');

  if (existentes.has('inspecciones') && existentes.has('vehiculos')) {
    const sinReal = await query(
      `SELECT COUNT(*) AS n FROM inspecciones WHERE fecha_realizada IS NULL`
    );
    console.log(`  inspecciones sin fecha real          : ${sinReal[0].n}`);
    if (sinReal[0].n > 0) {
      console.log('    Es normal en los vehiculos cargados antes de la migracion.');
      console.log('    El vencimiento se conserva; la real se completa cuando se sepa.');
    }

    // El vencimiento tiene que ser SIEMPRE real + 1 ano, + 5 en
    // recalificaciones. Si no cuadra, la doble escritura se
    // rompio en algun UPDATE manual o la migracion quedo a medias.
    const desvios = await query(
      `SELECT COUNT(*) AS n
         FROM inspecciones
        WHERE fecha_realizada IS NOT NULL
          AND fecha_vencimiento <> DATE_ADD(fecha_realizada, INTERVAL 1 YEAR)`
    );
    console.log(`  inspecciones con +1 ano incorrecto    : ${desvios[0].n}`);
    if (desvios[0].n > 0) {
      console.log('    AVISO: el vencimiento no coincide con la fecha real + 1 ano.');
    }
  }

  if (existentes.has('recalificaciones')) {
    const sinReal = await query(
      `SELECT COUNT(*) AS n FROM recalificaciones WHERE fecha_realizada IS NULL`
    );
    console.log(`  recalificaciones sin fecha real      : ${sinReal[0].n}`);

    const desvios = await query(
      `SELECT COUNT(*) AS n
         FROM recalificaciones
        WHERE fecha_realizada IS NOT NULL
          AND fecha_vencimiento <> DATE_ADD(fecha_realizada, INTERVAL 5 YEAR)`
    );
    console.log(`  recalificaciones con +5 anos erroneo : ${desvios[0].n}`);
    if (desvios[0].n > 0) {
      console.log('    AVISO: el vencimiento no coincide con la fecha real + 5 anos.');
    }
  }

  // Coherencia entre la tabla normalizada y la columna plana. Son
  // la misma fecha escrita dos veces; si divergen, el job viejo y
  // la app nueva darian avisos distintos para el mismo vehiculo.
  if (existentes.has('inspecciones') && existentes.has('vehiculos')) {
    const discrepancias = await query(
      `SELECT COUNT(*) AS n
         FROM vehiculos v
         JOIN inspecciones i ON i.id_vehiculo = v.id
        WHERE v.fecha_inspeccion <> i.fecha_vencimiento`
    );
    console.log(`  fechas planas que no cuadran (inspec.) : ${discrepancias[0].n}`);
    if (discrepancias[0].n > 0) {
      console.log('    AVISO: la columna vieja y la tabla nueva dicen cosas distintas.');
    }
  }

  if (existentes.has('recalificaciones') && existentes.has('vehiculos')) {
    const discrepancias = await query(
      `SELECT COUNT(*) AS n
         FROM vehiculos v
         JOIN recalificaciones r ON r.id_vehiculo = v.id
        WHERE v.fecha_recalificacion <> r.fecha_vencimiento`
    );
    console.log(`  fechas planas que no cuadran (recal.) : ${discrepancias[0].n}`);
  }

  // Los codigos de activacion: solo conteos y estados. El codigo en
  // claro no se imprime NUNCA, ni aqui ni en ningun log.
  if (existentes.has('codigos_activacion')) {
    const cods = await query(      `SELECT
         COUNT(*)                                                   AS total,
         COALESCE(SUM(CASE WHEN usado = 1 THEN 1 ELSE 0 END), 0)   AS usados,
         COALESCE(SUM(CASE WHEN usado = 0 AND fecha_expiracion < NOW() THEN 1 ELSE 0 END), 0) AS vencidos,
         COALESCE(SUM(CASE WHEN usado = 0 AND fecha_expiracion >= NOW() THEN 1 ELSE 0 END), 0) AS vigentes,
         COALESCE(SUM(CASE WHEN usado = 0 AND id_cliente IS NULL THEN 1 ELSE 0 END), 0) AS sin_cliente
       FROM codigos_activacion`
    );
    const c0 = cods[0];
    console.log('');
    console.log(`  codigos emitidos                     : ${c0.total}`);
    console.log(`    ya canjeados                       : ${c0.usados}`);
    console.log(`    vigentes                           : ${c0.vigentes}`);
    console.log(`    vencidos sin usar                  : ${c0.vencidos}`);
    if (c0.sin_cliente > 0) {
      console.log(`    sin cliente vinculado              : ${c0.sin_cliente}`);
      console.log('    AVISO: esos codigos no se pueden canjear; pide reemision.');
    }

    // Si el codigo estuviera en claro, no seria SHA-256.
    const planos = await query(
      `SELECT COUNT(*) AS n
         FROM codigos_activacion
        WHERE codigo_hash IS NOT NULL AND LENGTH(codigo_hash) <> 64`
    );
    console.log(`  codigos con hash raro (no SHA-256)    : ${planos[0].n}`);
    if (planos[0].n > 0) {
      problema('filas de codigos_activacion cuyo hash no mide 64 caracteres');
    }

    // El invariante de seguridad del modulo: la tabla NO debe tener
    // ninguna columna donde quepa el codigo en claro. Si alguien
    // anadio un `codigo` o un `codigo_plano` para "depurar rapido",
    // un dump de la base alcanza para activar cuentas ajenas. Se
    // comprueba el ESQUEMA, no los datos: por eso no hace falta
    // leer ninguna fila.
    const colsCodigo = await query(
      `SELECT COLUMN_NAME AS columna
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'codigos_activacion'
          AND (COLUMN_NAME LIKE '%codigo%' OR COLUMN_NAME LIKE '%plain%' OR COLUMN_NAME LIKE '%texto%')
          AND COLUMN_NAME <> 'codigo_hash'`
    );
    if (colsCodigo.length > 0) {
      console.log('');
      for (const c of colsCodigo) {
        console.log(`  COLUMNA CON POSIBLE CODIGO EN CLARO   : ${c.columna}`);
      }
      problema(`codigos_activacion tiene columnas que podrian guardar el codigo en claro: ${colsCodigo.map((c) => c.columna).join(', ')}`);
      console.log('    AVISO: el codigo solo debe existir como SHA-256. Revisa esas columnas.');
    } else {
      console.log('  columnas con el codigo en claro       : ninguna');
    }
  }

  console.log('');

  // ------------------------------------------------------------
  // 6. Inventario
  // ------------------------------------------------------------
  //  SOLO LECTURA. Este script no inserta, no actualiza y no
  //  borra nada: ni un producto, ni un movimiento, ni una
  //  cantidad. Sirve para comparar el origen contra el destino
  //  durante la migracion.
  console.log('  INVENTARIO');
  console.log('');

  if (!existentes.has('inventario_productos')) {
    console.log('    inventario_productos : (no existe)');
    console.log('    Falta aplicar database/migrations/006_add_inventario.sql');
    console.log('');
  } else {
    const productos = await query(
      `SELECT
         COUNT(*)                                              AS total,
         COALESCE(SUM(stock_actual), 0)                        AS unidades,
         COALESCE(SUM(CASE WHEN estado = 'activo'   THEN 1 ELSE 0 END), 0) AS activos,
         COALESCE(SUM(CASE WHEN estado = 'inactivo' THEN 1 ELSE 0 END), 0) AS inactivos,
         COALESCE(SUM(CASE WHEN stock_actual = 0  THEN 1 ELSE 0 END), 0) AS sin_stock,
         COALESCE(SUM(CASE WHEN stock_actual > 0
                             AND stock_actual <= stock_minimo
                                           THEN 1 ELSE 0 END), 0)  AS stock_bajo
       FROM inventario_productos`
    );

    const p = productos[0];

    console.log(`  productos                            : ${p.total}`);
    console.log(`  productos activos                    : ${p.activos}`);
    console.log(`  productos inactivos                  : ${p.inactivos}`);
    console.log(`  SUM(stock_actual)                    : ${p.unidades}`);
    console.log(`  productos_sin_stock                  : ${p.sin_stock}`);
    console.log(`  productos_stock_bajo                 : ${p.stock_bajo}`);
    console.log('');

    if (existentes.has('movimientos_inventario')) {
      const movs = await query(
        `SELECT
           COUNT(*)                                                            AS total,
           COALESCE(SUM(CASE WHEN tipo = 'ENTRADA' THEN 1 ELSE 0 END), 0)     AS entradas,
           COALESCE(SUM(CASE WHEN tipo = 'SALIDA'  THEN 1 ELSE 0 END), 0)     AS salidas,
           COALESCE(SUM(CASE WHEN tipo = 'AJUSTE'  THEN 1 ELSE 0 END), 0)     AS ajustes
         FROM movimientos_inventario`
      );

      const m = movs[0];

      console.log(`  movimientos_inventario               : ${m.total}`);
      console.log(`    entradas                           : ${m.entradas}`);
      console.log(`    salidas                            : ${m.salidas}`);
      console.log(`    ajustes                            : ${m.ajustes}`);
      console.log('');

      // products_con_stock_sin_movimiento: un producto con
      // cantidad pero sin ningun movimiento tiene el stock de
      // origen desconocido. No se corrige aqui: se reporta.
      const sinTrazabilidad = await query(
        `SELECT COUNT(*) AS n
           FROM inventario_productos p
          WHERE p.stock_actual <> 0
            AND NOT EXISTS (
              SELECT 1 FROM movimientos_inventario m
               WHERE m.id_producto = p.id_producto
            )`
      );

      console.log(`  productos con stock sin movimientos  : ${sinTrazabilidad[0].n}`);
      if (sinTrazabilidad[0].n > 0) {
        console.log('    AVISO: esos productos tienen cantidad pero ningun movimiento.');
        console.log('    No se corrigen solos. Revisarlos uno por uno antes de migrar.');
      }

      // La cuenta del historial tiene que cerrar con el stock
      // guardado. Si no cierra, se reporta: nunca se ajusta.
      const descuadres = await query(
        `SELECT COUNT(*) AS n
           FROM inventario_productos p
          WHERE p.stock_actual <> COALESCE((
                  SELECT SUM(
                    CASE m.tipo
                      WHEN 'ENTRADA' THEN  m.cantidad
                      WHEN 'SALIDA'  THEN -m.cantidad
                      ELSE (m.stock_nuevo - m.stock_anterior)
                    END)
                    FROM movimientos_inventario m
                   WHERE m.id_producto = p.id_producto
                ), 0)`
      );

      console.log(`  stock que no cuadra con el historial  : ${descuadres[0].n}`);
      if (descuadres[0].n > 0) {
        console.log('    AVISO: hay diferencias entre el stock guardado y los movimientos.');
        console.log('    Se muestran una por una, NO se corrigen automaticamente.');
      }

      // Listado de los productos con descuadre, sin datos
      // personales: solo codigo, nombre y numeros.
      if (descuadres[0].n > 0) {
        const detalle = await query(
          `SELECT p.codigo, p.nombre, p.stock_actual,
                  COALESCE((
                    SELECT SUM(
                      CASE m.tipo
                        WHEN 'ENTRADA' THEN  m.cantidad
                        WHEN 'SALIDA'  THEN -m.cantidad
                        ELSE (m.stock_nuevo - m.stock_anterior)
                      END)
                      FROM movimientos_inventario m
                     WHERE m.id_producto = p.id_producto
                  ), 0) AS stock_por_movimientos
             FROM inventario_productos p
            WHERE p.stock_actual <> COALESCE((
                    SELECT SUM(
                      CASE m.tipo
                        WHEN 'ENTRADA' THEN  m.cantidad
                        WHEN 'SALIDA'  THEN -m.cantidad
                        ELSE (m.stock_nuevo - m.stock_anterior)
                      END)
                      FROM movimientos_inventario m
                     WHERE m.id_producto = p.id_producto
                  ), 0)
            ORDER BY p.codigo
            LIMIT 50`
        );

        console.log('');
        console.log('  DETALLE DE DESCUADRES (producto, stock guardado, stock por movimientos)');
        for (const d of detalle) {
          console.log(
            `    ${String(d.codigo).padEnd(18)} ${String(d.nombre).slice(0, 34).padEnd(34)} ` +
              `guardado=${String(d.stock_actual).padStart(8)}  ` +
              `movimientos=${String(d.stock_por_movimientos).padStart(8)}`
          );
        }
        if (descuadres[0].n > detalle.length) {
          console.log(`    ... y ${descuadres[0].n - detalle.length} mas`);
        }
      }

      console.log('');
    }
  }

  // ------------------------------------------------------------
  // 7. El cilindro NO es una entidad
  //
  //  Va FUERA del bloque de inventario a proposito: aunque
  //  `inventario_productos` no exista (base a medio migrar), estas
  //  estructuras siguen teniendo que estar ausentes. Adentro se
  //  esquivarian justo cuando mas falta haria revisarlas.
  //
  //  Todo sale del catalogo de `information_schema`: no se lee
  //  ninguna fila, asi que esto se puede correr en produccion.
  // ------------------------------------------------------------
  console.log('  ESTRUCTURAS DE CILINDRO');
  console.log('');

  if (PROHIBIDAS.length === 0) {
    console.log('  estructuras de cilindro            : ninguna (correcto)');
    console.log('    El cilindro no es una entidad. La IA recomienda por medida');
    console.log('    y toma los precios de parametros_precios.');
  } else {
    console.log(`  estructuras de cilindro            : ${PROHIBIDAS.length} (no deberian existir)`);
    for (const p of PROHIBIDAS) {
      const donde = p.tipo === 'TABLA' ? `tabla ${p.tabla}` : `${p.tabla}.${p.columna}`;
      console.log(`    ${donde}`);
      problema(`Existe ${donde}. La 011 (011_retirar_cilindros.sql) deberia haberla retirado.`);
    }
  }

  // ------------------------------------------------------------
  // 8. Precios: lo UNICO que la IA lee de la base
  // ------------------------------------------------------------
  console.log('');
  console.log('  PRECIOS PARA LA IA');
  console.log('');

  if (!existentes.has('parametros_precios')) {
    console.log('  parametros_precios                : (no existe)');
    problema('falta la tabla parametros_precios (007_inventario_datos_ia.sql)');
    console.log('    Sin ella la IA no puede cotizar nada: no hay de donde sacar precios.');
  } else {
    const parametros = await query(
      'SELECT clave, valor, moneda FROM parametros_precios ORDER BY clave'
    );

    console.log(`  parametros_precios                : ${parametros.length}`);
    console.log('');

    for (const p of parametros) {
      console.log(`    ${String(p.clave).padEnd(24)} ${String(p.valor).padStart(12)} ${p.moneda}`);
    }

    // Las claves las arma el modulo de IA. Se importan desde ahi
    // en vez de repetirlas aqui: si el prefijo o la clave de mano
    // de obra cambian, esta lista avisa del nombre viejo en vez de
    // dar un falso "todo bien".
    const {
      clavePrecioInstalacion,
      PREFIJO_PRECIO_CILINDRO,
      listarCilindrosReferencia,
    } = await import('../src/ai/vehicleRecognition/vehicleRecognition.service.js');

    const claveInstalacion = clavePrecioInstalacion();
    const prefijoCilindro = PREFIJO_PRECIO_CILINDRO;

    const capacidades = listarCilindrosReferencia()
      .map((c) => c.capacidad_litros)
      .sort((a, b) => a - b);

    console.log('');
    console.log('  MANO DE OBRA');
    const instalacion = parametros.find((p) => p.clave === claveInstalacion);

    if (instalacion) {
      console.log(
        `    ${claveInstalacion.padEnd(24)} ${String(instalacion.valor).padStart(12)} ${instalacion.moneda} (cargado)`
      );
    } else {
      console.log(`    ${claveInstalacion.padEnd(24)} sin cargar`);
      problema(`no hay precio para '${claveInstalacion}' (mano de obra)`);
      console.log('    La estimacion de la IA avisa que falta el dato; no inventa un total.');
    }

    // Precios de cilindro por capacidad. El conteo de capacidades
    // sale del catalogo referencial, no de un numero escrito a
    // mano: asi el aviso sigue siendo cierto si el catalogo crece.
    console.log('');
    console.log('  PRECIO DE CILINDRO POR CAPACIDAD');
    console.log('');

    const conPrecio = [];
    const sinPrecio = [];

    for (const capacidad of capacidades) {
      const clave = `${prefijoCilindro}${capacidad}`;
      const fila = parametros.find((p) => p.clave === clave);
      if (fila) conPrecio.push({ capacidad, fila });
      else sinPrecio.push(capacidad);
    }

    console.log(`  capacidades con precio            : ${conPrecio.length} de ${capacidades.length}`);

    for (const { capacidad, fila } of conPrecio) {
      console.log(
        `    ${`${prefijoCilindro}${capacidad}`.padEnd(24)} ${String(fila.valor).padStart(12)} ${fila.moneda}`
      );
    }

    if (sinPrecio.length > 0) {
      console.log(`  capacidades SIN precio            : ${sinPrecio.join(' L, ')} L`);
      // Faltar uno no rompe nada: la IA avisa al cotizar esa
      // capacidad. Faltar todos es lo que hay que mirar.
      if (conPrecio.length === 0) {
        problema('no hay ningun precio de cilindro cargado');
        console.log('    La IA puede recomendar la medida, pero no puede cotizar nada.');
      }
    } else {
      console.log('  capacidades SIN precio            : ninguna');
    }

    // Claves `cilindro_*` que no corresponden a ninguna capacidad
    // del catalogo. Casi siempre es una capacidad que se retiro
    // del catalogo y el precio se quedo atras.
    const capacities = new Set(capacidades);
    const huerfanosPrecio = parametros.filter(
      (p) =>
        p.clave.startsWith(prefijoCilindro) &&
        !capacities.has(Number(p.clave.slice(prefijoCilindro.length)))
    );

    if (huerfanosPrecio.length > 0) {
      console.log('');
      for (const p of huerfanosPrecio) {
        console.log(`  precio sin capacidad en catalogo  : ${p.clave}`);
      }
      console.log('    No se usan: el catalogo no ofrece esa medida. Se pueden borrar.');
    }
  }

  console.log('');
  linea();
  if (huerfanos > 0) {
    console.log(`  Registros huerfanos: ${huerfanos}`);
    problema(`${huerfanos} registro(s) apuntan a una fila que no existe`);
  }
  if (problemas.length === 0) {
    console.log('  RESULTADO: sin problemas');
  } else {
    console.log(`  RESULTADO: ${problemas.length} problema(s)`);
    problemas.forEach((p, i) => console.log(`    ${i + 1}. ${p}`));
    if (!ESTRICTO) {
      console.log('');
      console.log('  (solo informar. Para que esto falle el proceso: npm run db:verify -- --estricto)');
    }
  }
  linea();

  if (problemas.length > 0 && ESTRICTO) process.exitCode = 1;
}

main()
  .then(() => {
    // process.exit(0) borraria el exitCode puesto por --estricto:
    // hay que salir sin forzar el codigo para que sobreviva.
    closePool().catch(() => {});
  })
  .catch(async (error) => {
    console.error(`\n  Error al verificar: ${error.code || error.name} - ${error.message}`);
    await closePool().catch(() => {});
    process.exit(1);
  });
