<?php
// ============================================================
//  get_inventario.php — Listar artículos del inventario
//  GET (requiere sesión)
// ============================================================
require_once 'config.php';

requireAuth();

$db   = getDB();
$stmt = $db->query(
    'SELECT id, nombre, descripcion, cantidad,
            CAST(precio_compra AS DECIMAL(10,2)) AS precio_compra,
            CAST(precio_venta  AS DECIMAL(10,2)) AS precio_venta,
            proveedor
     FROM articulos_inventario
     ORDER BY nombre'
);

jsonSuccess(['articulos' => $stmt->fetchAll()]);