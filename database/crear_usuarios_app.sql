-- ============================================================
--  database/crear_usuarios_app.sql
--  Crea el usuario DEDICADO de SIGE-GNV. La aplicacion deja de
--  usar root.
--
--  ------------------------------------------------------------
--  DONDE SE EJECUTA
--  ------------------------------------------------------------
--  MariaDB 13.0 esta instalado como servicio de Windows, en el
--  puerto 3306. El cliente esta en:
--      C:\Program Files\MariaDB 13.0\bin\mariadb.exe
--
--  Opcion A (recomendada, sin escribir nada en la terminal):
--    1. Abre HeidiSQL, DBeaver o cualquier cliente MariaDB.
--    2. Conectate al servidor 127.0.0.1:3306 como root.
--    3. Abre este archivo y ejecuta el script entero.
--
--  Opcion B (consola de PowerShell, en la carpeta del proyecto):
--    & "C:\Program Files\MariaDB 13.0\bin\mariadb.exe" `
--        -h 127.0.0.1 -P 3306 -u root -p `
--        -e "source C:/Users/camii/Music/Proyecto/database/crear_usuarios_app.sql"
--
--    MariaDB te pide la clave de root. No la escribas aca ni me la
--    mandes: se teclea en el prompt y no queda en el historial.
--
--  ------------------------------------------------------------
--  ANTES DE EJECUTAR
--  ------------------------------------------------------------
--  Reemplaza, en TODO el archivo, estos dos marcadores:
--      CLAVE_DE_GNV_APP     -> la clave de la aplicacion
--      CLAVE_DE_GNV_ADMIN  -> la clave de migraciones
--
--  Deben ser DISTINTAS entre si. La de gnv_admin no la necesita
--  la aplicacion: es solo para quien aplique migraciones.
--
--  La aplicacion se conecta por TCP a 127.0.0.1, por eso estan
--  las dos filas de cada usuario ('localhost' y '127.0.0.1').
--
--  ------------------------------------------------------------
--  POR QUE DOS USUARIOS
--  ------------------------------------------------------------
--  gnv_app     -> lo usa la API. Solo lee y escribe filas (DML).
--  gnv_admin   -> lo usa quien aplica migraciones. Puede crear
--                 y alterar tablas y vistas (DDL).
--
--  La migracion 008 hace "DROP VIEW IF EXISTS", y un usuario sin
--  ese privilegio no puede. Por eso el DDL no se pide en la
--  sesion del dia a dia. root solo hace falta para esto y para
--  crear la base si un dia se restaura un backup.
--
--  ------------------------------------------------------------
--  LO QUE NO HACE ESTE ARCHIVO
--  ------------------------------------------------------------
--    - No borra ni modifica ninguna fila de datos.
--    - No hace DROP ni TRUNCATE de ninguna tabla.
--    - Solo crea usuarios y concede privilegios.
--
--  Es re-ejecutable: CREATE USER IF NOT EXISTS y GRANT son
--  idempotentes. Se puede volver a aplicar sin romper nada.
--
--  OJO: si el usuario YA existe con otra clave, CREATE USER IF NOT
--  EXISTS no la cambia. Para rotar la clave:
--      ALTER USER 'gnv_app'@'127.0.0.1' IDENTIFIED BY 'CLAVE_NUEVA';
-- ============================================================

-- ------------------------------------------------------------
--  1) Usuario de la APLICACION
--     Solo DML sobre gnv_taller. Es el que va en el .env.
-- ------------------------------------------------------------
CREATE USER IF NOT EXISTS 'gnv_app'@'localhost'
  IDENTIFIED BY 'CLAVE_DE_GNV_APP';
CREATE USER IF NOT EXISTS 'gnv_app'@'127.0.0.1'
  IDENTIFIED BY 'CLAVE_DE_GNV_APP';

GRANT SELECT, INSERT, UPDATE, DELETE
  ON gnv_taller.*
  TO 'gnv_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE
  ON gnv_taller.*
  TO 'gnv_app'@'127.0.0.1';

-- ------------------------------------------------------------
--  2) Usuario de MIGRACIONES
--     DDL incluido. No se usa desde la aplicacion.
-- ------------------------------------------------------------
CREATE USER IF NOT EXISTS 'gnv_admin'@'localhost'
  IDENTIFIED BY 'CLAVE_DE_GNV_ADMIN';
CREATE USER IF NOT EXISTS 'gnv_admin'@'127.0.0.1'
  IDENTIFIED BY 'CLAVE_DE_GNV_ADMIN';

GRANT ALL PRIVILEGES
  ON gnv_taller.*
  TO 'gnv_admin'@'localhost';
GRANT ALL PRIVILEGES
  ON gnv_taller.*
  TO 'gnv_admin'@'127.0.0.1';

-- El usuario de la aplicacion tiene que poder seguir leyendo y
-- escribiendo despues de que el admin aplique una migracion.
-- Sin esto, MariaDB no recalcula los privilegios en caliente.
FLUSH PRIVILEGES;

-- ------------------------------------------------------------
--  3) Comprobacion
--     Debe listar los dos usuarios con sus privilegios.
--     SELECT * FROM mysql.user no se usa a proposito: el usuario
--     recien creado todavia no puede ver esa tabla.
-- ------------------------------------------------------------
SELECT User, Host FROM mysql.user
 WHERE User IN ('gnv_app', 'gnv_admin')
 ORDER BY User, Host;

SHOW GRANTS FOR 'gnv_app'@'localhost';
