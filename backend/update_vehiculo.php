<?php
// ============================================================
//  update_vehiculo.php — Editar vehículo existente
//  PUT { id, nombre, apellido, placa, fecha_recalificacion,
//        fecha_inspeccion, telefono }
// ============================================================
require_once 'config.php';

requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'PUT') {
    jsonError(405, 'Método no permitido.');
}

$body = json_decode(file_get_contents('php://input'), true);

$id                   = (int)($body['id']                   ?? 0);
$nombre               = trim($body['nombre']               ?? '');
$apellido             = trim($body['apellido']             ?? '');
$placa                = strtoupper(trim($body['placa']     ?? ''));
$fecha_recalificacion = trim($body['fecha_recalificacion'] ?? '');
$fecha_inspeccion     = trim($body['fecha_inspeccion']     ?? '');
$telefono             = trim($body['telefono']             ?? '');

if (!$id || !$nombre || !$apellido || !$placa || !$fecha_recalificacion || !$fecha_inspeccion || !$telefono) {
    jsonError(400, 'Todos los campos son obligatorios.');
}

$db = getDB();

// Verificar que existe
$check = $db->prepare('SELECT id FROM vehiculos WHERE id = ? LIMIT 1');
$check->execute([$id]);
if (!$check->fetch()) {
    jsonError(404, 'Vehículo no encontrado.');
}

// Verificar placa duplicada (excluyendo el registro actual)
$dupCheck = $db->prepare('SELECT id FROM vehiculos WHERE placa = ? AND id != ? LIMIT 1');
$dupCheck->execute([$placa, $id]);
if ($dupCheck->fetch()) {
    jsonError(409, "La placa {$placa} ya está asignada a otro vehículo.");
}

$stmt = $db->prepare(
    'UPDATE vehiculos
     SET nombre=?, apellido=?, placa=?, fecha_recalificacion=?, fecha_inspeccion=?, telefono=?
     WHERE id=?'
);
$stmt->execute([$nombre, $apellido, $placa, $fecha_recalificacion, $fecha_inspeccion, $telefono, $id]);

// Si cambió alguna fecha, borrar recordatorios para que se puedan re-enviar
$db->prepare('DELETE FROM recordatorios_enviados WHERE vehiculo_id = ?')->execute([$id]);

jsonSuccess(['message' => 'Vehículo actualizado correctamente.']);
