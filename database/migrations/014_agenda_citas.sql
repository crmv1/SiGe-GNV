-- ============================================================
-- 014_agenda_citas.sql
-- Módulo de Citas/Inspecciones/Recalificaciones (Agenda)
-- No modifica BD existente. Solo agrega nuevas tablas.
-- Reutiliza clientes, vehiculos, usuarios.
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- 1) Configuración de agenda
CREATE TABLE IF NOT EXISTS agenda_config (
  id int(11) NOT NULL AUTO_INCREMENT,
  nombre varchar(100) NOT NULL DEFAULT 'Taller',
  dias_laborales json NOT NULL COMMENT 'Ej: [1,2,3,4,5] lunes-viernes',
  hora_apertura time NOT NULL DEFAULT '08:00:00',
  hora_cierre time NOT NULL DEFAULT '18:00:00',
  duracion_cita_min int(11) NOT NULL DEFAULT 60 COMMENT 'minutos',
  descansos json DEFAULT NULL COMMENT 'Ej: [{\"inicio\":\"12:00\",\"fin\":\"13:00\"}]',
  capacidad_por_franja int(11) NOT NULL DEFAULT 1 COMMENT 'vehículos por franja',
  activo tinyint(1) NOT NULL DEFAULT 1,
  created_at timestamp NOT NULL DEFAULT current_timestamp(),
  updated_at timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO agenda_config (id, dias_laborales, hora_apertura, hora_cierre, duracion_cita_min, capacidad_por_franja, activo)
VALUES (1, '[1,2,3,4,5]', '08:00:00', '18:00:00', 60, 1, 1);

-- 2) Bloqueos de agenda
CREATE TABLE IF NOT EXISTS agenda_bloqueos (
  id int(11) NOT NULL AUTO_INCREMENT,
  titulo varchar(200) NOT NULL,
  tipo enum('feriado','no_laborable','bloqueo','descanso') NOT NULL DEFAULT 'bloqueo',
  todo_el_dia tinyint(1) NOT NULL DEFAULT 1,
  fecha_inicio date NOT NULL,
  fecha_fin date DEFAULT NULL,
  hora_inicio time DEFAULT NULL,
  hora_fin time DEFAULT NULL,
  observaciones text DEFAULT NULL,
  creado_por int(11) DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (id),
  KEY idx_fechas (fecha_inicio, fecha_fin),
  CONSTRAINT agenda_bloqueos_ibfk_1 FOREIGN KEY (creado_por) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 3) Citas
CREATE TABLE IF NOT EXISTS citas (
  id int(11) NOT NULL AUTO_INCREMENT,
  cliente_id int(11) NOT NULL,
  vehiculo_id int(11) NOT NULL,
  tipo_servicio enum('inspeccion','recalificacion') NOT NULL,
  fecha date NOT NULL,
  hora_inicio time NOT NULL,
  hora_fin time NOT NULL,
  estado enum('RESERVADA','CONFIRMADA','EN_ATENCION','COMPLETADA','CANCELADA','NO_ASISTIO','REPROGRAMADA') NOT NULL DEFAULT 'RESERVADA',
  tecnico_id int(11) DEFAULT NULL,
  creado_por int(11) DEFAULT NULL,
  origen enum('web','movil','sistema') NOT NULL DEFAULT 'web',
  observaciones text DEFAULT NULL,
  motivo_cancelacion text DEFAULT NULL,
  motivo_reprogramacion text DEFAULT NULL,
  fecha_original date DEFAULT NULL,
  hora_original time DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT current_timestamp(),
  updated_at timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (id),
  KEY idx_fecha_hora (fecha, hora_inicio),
  KEY idx_cliente (cliente_id),
  KEY idx_vehiculo (vehiculo_id),
  KEY idx_estado (estado),
  KEY idx_tecnico (tecnico_id),
  CONSTRAINT citas_ibfk_1 FOREIGN KEY (cliente_id) REFERENCES clientes (id) ON DELETE RESTRICT,
  CONSTRAINT citas_ibfk_2 FOREIGN KEY (vehiculo_id) REFERENCES vehiculos (id) ON DELETE RESTRICT,
  CONSTRAINT citas_ibfk_3 FOREIGN KEY (tecnico_id) REFERENCES usuarios (id) ON DELETE SET NULL,
  CONSTRAINT citas_ibfk_4 FOREIGN KEY (creado_por) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 4) Historial estados
CREATE TABLE IF NOT EXISTS cita_estados_historial (
  id int(11) NOT NULL AUTO_INCREMENT,
  cita_id int(11) NOT NULL,
  estado_anterior varchar(30) DEFAULT NULL,
  estado_nuevo varchar(30) NOT NULL,
  usuario_id int(11) DEFAULT NULL,
  observaciones text DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (id),
  KEY idx_cita (cita_id),
  KEY idx_usuario (usuario_id),
  CONSTRAINT cita_estados_historial_ibfk_1 FOREIGN KEY (cita_id) REFERENCES citas (id) ON DELETE CASCADE,
  CONSTRAINT cita_estados_historial_ibfk_2 FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 5) Resultados
CREATE TABLE IF NOT EXISTS inspecciones_resultados (
  id int(11) NOT NULL AUTO_INCREMENT,
  cita_id int(11) DEFAULT NULL,
  vehiculo_id int(11) NOT NULL,
  cliente_id int(11) NOT NULL,
  tipo_servicio enum('inspeccion','recalificacion') NOT NULL,
  estado_servicio enum('PENDIENTE','EN_PROCESO','APROBADO','OBSERVADO') NOT NULL DEFAULT 'PENDIENTE',
  resultado varchar(100) DEFAULT NULL,
  observaciones text DEFAULT NULL,
  tecnico_id int(11) DEFAULT NULL,
  fecha_realizada date DEFAULT NULL,
  proxima_fecha date DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT current_timestamp(),
  updated_at timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (id),
  KEY idx_cita (cita_id),
  KEY idx_vehiculo (vehiculo_id),
  KEY idx_cliente (cliente_id),
  KEY idx_tecnico (tecnico_id),
  CONSTRAINT inspecciones_resultados_ibfk_1 FOREIGN KEY (cita_id) REFERENCES citas (id) ON DELETE SET NULL,
  CONSTRAINT inspecciones_resultados_ibfk_2 FOREIGN KEY (vehiculo_id) REFERENCES vehiculos (id) ON DELETE RESTRICT,
  CONSTRAINT inspecciones_resultados_ibfk_3 FOREIGN KEY (cliente_id) REFERENCES clientes (id) ON DELETE RESTRICT,
  CONSTRAINT inspecciones_resultados_ibfk_4 FOREIGN KEY (tecnico_id) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
