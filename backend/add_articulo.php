<?php
// ============================================================
//  add_articulo.php — Registrar nuevo artículo de inventario
//  POST { nombre, descripcion, cantidad, precio_compra,
//         precio_venta, proveedor }
//  La cantidad inicial genera un movimiento de 'entrada'.
// ============================================================
require_once 'config.php';

requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonError(405, 'Método no permitido.');
}

$body = json_decode(file_get_contents('php://input'), true);

$nombre        = trim($body['nombre']        ?? '');
$descripcion   = trim($body['descripcion']   ?? '');
$cantidad      = (int)($body['cantidad']     ?? 0);
$precio_compra = (float)($body['precio_compra'] ?? 0);
$precio_venta  = (float)($body['precio_venta']  ?? 0);
$proveedor     = trim($body['proveedor']     ?? '');

if (!$nombre) {
    jsonError(400, 'El nombre del artículo es obligatorio.');
}
if ($cantidad < 0) {
    jsonError(400, 'La cantidad no puede ser negativa.');
}
if ($precio_compra < 0 || $precio_venta < 0) {
    jsonError(400, 'Los precios no pueden ser negativos.');
}

$db = getDB();
$db->beginTransaction();

try {
    $stmt = $db->prepare(
        'INSERT INTO articulos_inventario
            (nombre, descripcion, cantidad, precio_compra, precio_venta, proveedor)
         VALUES (?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([$nombre, $descripcion, $cantidad, $precio_compra, $precio_venta, $proveedor]);

    $id = (int)$db->lastInsertId();

    // Movimiento inicial de entrada
    if ($cantidad > 0) {
        $db->prepare(
            'INSERT INTO movimientos_inventario (articulo_id, tipo, cantidad, fecha, usuario_id)
             VALUES (?, "entrada", ?, NOW(), ?)'
        )->execute([$id, $cantidad, $_SESSION['user_id']]);
    }

    $db->commit();
    jsonSuccess(['id' => $id, 'message' => 'Artículo registrado correctamente.'], 201);
} catch (Throwable $e) {
    $db->rollBack();
    jsonError(500, 'Error al registrar el artículo: ' . $e->getMessage());
}