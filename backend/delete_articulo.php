<?php
// ============================================================
//  delete_articulo.php — Eliminar artículo (solo administrador)
//  DELETE { id }  (los movimientos se borran en cascada)
// ============================================================
require_once 'config.php';

requireAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    jsonError(405, 'Método no permitido.');
}

$body = json_decode(file_get_contents('php://input'), true);
$id   = (int)($body['id'] ?? 0);

if (!$id) {
    jsonError(400, 'ID de artículo inválido.');
}

$db   = getDB();
$stmt = $db->prepare('DELETE FROM articulos_inventario WHERE id = ?');
$stmt->execute([$id]);

if ($stmt->rowCount() === 0) {
    jsonError(404, 'Artículo no encontrado.');
}

jsonSuccess(['message' => 'Artículo eliminado correctamente.']);