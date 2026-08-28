<?php
// ============================================================
//  add_movimiento.php — Registrar movimiento de stock
//  POST { articulo_id, tipo: entrada|salida, cantidad, fecha? }
//  Actualiza la cantidad del artículo en una transacción.
// ============================================================
require_once 'config.php';

requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonError(405, 'Método no permitido.');
}

$body = json_decode(file_get_contents('php://input'), true);

$articuloId = (int)($body['articulo_id'] ?? 0);
$tipo       = $body['tipo'] ?? '';
$cantidad   = (int)($body['cantidad'] ?? 0);
$fechaRaw   = trim($body['fecha'] ?? '');

if (!$articuloId || !in_array($tipo, ['entrada', 'salida'], true) || $cantidad <= 0) {
    jsonError(400, 'Datos del movimiento inválidos. Tipo debe ser entrada o salida.');
}

$fecha = $fechaRaw !== '' ? $fechaRaw : date('Y-m-d H:i:s');
if (!preg_match('/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/', $fecha)) {
    jsonError(400, 'Formato de fecha inválido. Use YYYY-MM-DD HH:MM.');
}
// Normalizar a formato MySQL
$fecha = str_replace('T', ' ', $fecha);
if (strlen($fecha) === 19) $fecha .= ''; // ya tiene segundos
elseif (strlen($fecha) === 16) $fecha .= ':00';

$db = getDB();

$check = $db->prepare('SELECT id, cantidad FROM articulos_inventario WHERE id = ? LIMIT 1');
$check->execute([$articuloId]);
$articulo = $check->fetch();

if (!$articulo) {
    jsonError(404, 'Artículo no encontrado.');
}

if ($tipo === 'salida' && $articulo['cantidad'] < $cantidad) {
    jsonError(409, 'Stock insuficiente. Disponible: ' . $articulo['cantidad']);
}

$db->beginTransaction();

try {
    if ($tipo === 'entrada') {
        $nueva = $articulo['cantidad'] + $cantidad;
    } else {
        $nueva = $articulo['cantidad'] - $cantidad;
    }

    $db->prepare('UPDATE articulos_inventario SET cantidad = ? WHERE id = ?')
       ->execute([$nueva, $articuloId]);

    $db->prepare(
        'INSERT INTO movimientos_inventario (articulo_id, tipo, cantidad, fecha, usuario_id)
         VALUES (?, ?, ?, ?, ?)'
    )->execute([$articuloId, $tipo, $cantidad, $fecha, $_SESSION['user_id']]);

    $movId = (int)$db->lastInsertId();

    $db->commit();
    jsonSuccess(['id' => $movId, 'cantidad_nueva' => $nueva, 'message' => 'Movimiento registrado correctamente.'], 201);
} catch (Throwable $e) {
    $db->rollBack();
    jsonError(500, 'Error al registrar el movimiento: ' . $e->getMessage());
}