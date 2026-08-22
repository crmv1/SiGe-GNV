<?php
// ============================================================
//  delete_vehiculo.php — Eliminar vehículo (solo administrador)
//  DELETE { id }
// ============================================================
require_once 'config.php';

requireAdmin(); // 403 automático si no es admin

if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    jsonError(405, 'Método no permitido.');
}

$body = json_decode(file_get_contents('php://input'), true);
$id   = (int)($body['id'] ?? 0);

if (!$id) {
    jsonError(400, 'ID de vehículo inválido.');
}

$db   = getDB();
$stmt = $db->prepare('DELETE FROM vehiculos WHERE id = ?');
$stmt->execute([$id]);

if ($stmt->rowCount() === 0) {
    jsonError(404, 'Vehículo no encontrado.');
}

jsonSuccess(['message' => 'Vehículo eliminado correctamente.']);
