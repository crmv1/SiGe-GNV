<?php
// ============================================================
//  update_articulo.php — Editar datos de un artículo
//  PUT { id, nombre, descripcion, precio_compra, precio_venta,
//        proveedor }  (el stock se controla con movimientos)
// ============================================================
require_once 'config.php';

requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'PUT') {
    jsonError(405, 'Método no permitido.');
}

$body = json_decode(file_get_contents('php://input'), true);

$id            = (int)($body['id']            ?? 0);
$nombre        = trim($body['nombre']        ?? '');
$descripcion   = trim($body['descripcion']   ?? '');
$precio_compra = (float)($body['precio_compra'] ?? 0);
$precio_venta  = (float)($body['precio_venta']  ?? 0);
$proveedor     = trim($body['proveedor']     ?? '');

if (!$id || !$nombre) {
    jsonError(400, 'ID y nombre del artículo son obligatorios.');
}
if ($precio_compra < 0 || $precio_venta < 0) {
    jsonError(400, 'Los precios no pueden ser negativos.');
}

$db = getDB();

$check = $db->prepare('SELECT id FROM articulos_inventario WHERE id = ? LIMIT 1');
$check->execute([$id]);
if (!$check->fetch()) {
    jsonError(404, 'Artículo no encontrado.');
}

$stmt = $db->prepare(
    'UPDATE articulos_inventario
     SET nombre=?, descripcion=?, precio_compra=?, precio_venta=?, proveedor=?
     WHERE id=?'
);
$stmt->execute([$nombre, $descripcion, $precio_compra, $precio_venta, $proveedor, $id]);

jsonSuccess(['message' => 'Artículo actualizado correctamente.']);