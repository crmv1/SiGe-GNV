<?php
// ============================================================
//  add_vehiculo.php — Insertar nuevo vehículo
//  POST { nombre, apellido, placa, fecha_recalificacion,
//         fecha_inspeccion, telefono }
// ============================================================
require_once 'config.php';

requireAuth(); // Tanto técnico como admin pueden agregar

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonError(405, 'Método no permitido.');
}

$body = json_decode(file_get_contents('php://input'), true);

$nombre               = trim($body['nombre']               ?? '');
$apellido             = trim($body['apellido']             ?? '');
$placa                = strtoupper(trim($body['placa']     ?? ''));
$fecha_recalificacion = trim($body['fecha_recalificacion'] ?? '');
$fecha_inspeccion     = trim($body['fecha_inspeccion']     ?? '');
$telefono             = trim($body['telefono']             ?? '');

// Validaciones básicas
if (!$nombre || !$apellido || !$placa || !$fecha_recalificacion || !$fecha_inspeccion || !$telefono) {
    jsonError(400, 'Todos los campos son obligatorios.');
}

if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha_recalificacion) ||
    !preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha_inspeccion)) {
    jsonError(400, 'Formato de fecha inválido. Use YYYY-MM-DD.');
}

$db = getDB();

// Verificar placa duplicada
$check = $db->prepare('SELECT id FROM vehiculos WHERE placa = ? LIMIT 1');
$check->execute([$placa]);
if ($check->fetch()) {
    jsonError(409, "La placa {$placa} ya está registrada.");
}

$stmt = $db->prepare(
    'INSERT INTO vehiculos (nombre, apellido, placa, fecha_recalificacion, fecha_inspeccion, telefono)
     VALUES (?, ?, ?, ?, ?, ?)'
);
$stmt->execute([$nombre, $apellido, $placa, $fecha_recalificacion, $fecha_inspeccion, $telefono]);

jsonSuccess(['id' => (int)$db->lastInsertId(), 'message' => 'Vehículo registrado correctamente.'], 201);
