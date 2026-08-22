<?php
// ============================================================
//  get_vehiculos.php — Listar todos los vehículos
//  GET (requiere sesión)
// ============================================================
require_once 'config.php';

requireAuth();

$db   = getDB();
$stmt = $db->query(
    'SELECT id, nombre, apellido, placa,
            DATE_FORMAT(fecha_recalificacion, "%Y-%m-%d") AS fecha_recalificacion,
            DATE_FORMAT(fecha_inspeccion,     "%Y-%m-%d") AS fecha_inspeccion,
            telefono
     FROM vehiculos
     ORDER BY apellido, nombre'
);

$vehiculos = $stmt->fetchAll();

jsonSuccess(['vehiculos' => $vehiculos]);
