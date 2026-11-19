SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS cot_modelos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  marca VARCHAR(80) NOT NULL, modelo VARCHAR(80) NOT NULL,
  UNIQUE (marca, modelo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO cot_modelos (marca, modelo) VALUES
('Toyota','Corolla'),('Toyota','Hiace'),('Toyota','Probox'),('Toyota','Succeed'),
('Toyota','Noah'),('Toyota','Voxy'),('Toyota','Ipsum'),('Toyota','Caldina'),
('Toyota','Starlet'),('Toyota','Tercel'),('Toyota','Vitz'),('Toyota','Yaris'),
('Toyota','Wish'),('Toyota','RAV4'),('Nissan','Sunny'),('Nissan','AD'),
('Nissan','Sentra'),('Nissan','Tiida'),('Nissan','Wingroad'),('Nissan','Caravan'),
('Nissan','March'),('Nissan','Bluebird'),('Suzuki','Carry'),('Suzuki','Alto'),
('Suzuki','Swift'),('Suzuki','APV'),('Hyundai','H100'),('Hyundai','Accent'),
('Mitsubishi','Delica'),('Mazda','Familia');

CREATE TABLE IF NOT EXISTS cot_fichas (
  id INT AUTO_INCREMENT PRIMARY KEY, modelo_id INT NOT NULL,
  generacion VARCHAR(100) NOT NULL, desde SMALLINT, hasta SMALLINT,
  carroceria VARCHAR(100), maletera_l DECIMAL(8,2), dimensiones VARCHAR(1000),
  fuente VARCHAR(500), verificada BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (modelo_id) REFERENCES cot_modelos(id),
  UNIQUE (modelo_id, generacion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- La fuente documenta una unidad de esta variante, no todo el rango de la generación.
INSERT IGNORE INTO cot_fichas (modelo_id,generacion,carroceria,dimensiones,fuente)
SELECT id,'B13 · FB13 1500 Super Saloon SV 60th Anniversary (1993)','Sedán',
  'Exterior: largo 4250 mm, ancho 1670 mm, alto 1375 mm; batalla 2430 mm.',
  'https://www.nissan-global.com/EN/HERITAGE_COLLECTION/355_sunny_1500_super_saloon.html'
FROM cot_modelos WHERE marca='Nissan' AND modelo='Sunny';

CREATE TABLE IF NOT EXISTS cot_equipos (
  id INT PRIMARY KEY, nombre VARCHAR(120) NOT NULL, precio DECIMAL(10,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO cot_equipos VALUES
(3,'Tercera generación · aspirado natural',4300),(5,'Quinta generación · inyección secuencial',6100);

CREATE TABLE IF NOT EXISTS cot_cilindros (
  litros INT PRIMARY KEY, precio DECIMAL(10,2) NOT NULL,
  producto_id INT, ficha_oficial VARCHAR(500), datos_verificados VARCHAR(1000),
  FOREIGN KEY (producto_id) REFERENCES inventario_productos(id_producto)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO cot_cilindros (litros, precio) VALUES (40,4200),(60,5200),(80,6200),(100,7200);

CREATE TABLE IF NOT EXISTS cot_alternativas (
  id INT AUTO_INCREMENT PRIMARY KEY, ficha_id INT NOT NULL, equipo_id INT NOT NULL,
  litros INT NOT NULL, notas VARCHAR(1000) NOT NULL, verificada_por INT NOT NULL,
  verificada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  FOREIGN KEY (ficha_id) REFERENCES cot_fichas(id),
  FOREIGN KEY (equipo_id) REFERENCES cot_equipos(id),
  FOREIGN KEY (litros) REFERENCES cot_cilindros(litros)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cot_config (
  id INT PRIMARY KEY, anio_guia SMALLINT NOT NULL,
  modalidad ENUM('separado','kit_incluye_cilindro') NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO cot_config VALUES (1,2017,'separado');

CREATE TABLE IF NOT EXISTS cot_historial (
  id INT AUTO_INCREMENT PRIMARY KEY, usuario_id INT NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  datos JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
