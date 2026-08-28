<?php
// ============================================================
//  get_movimientos.php — Listar movimientos de inventario
//  GET (requiere sesión)   ?articulo_id= para filtrar
// ============================================================
require_once 'config.php';

requireAuth();

$db = getDB();

$articuloId = isset($_GET['articulo_id']) ? (int)$_GET['articulo_id'] : 0;

if ($articuloId) {
    $stmt = $db->prepare(
        'SELECT m.id, m.articulo_id, m.tipo, m.cantidad,
                DATE_FORMAT(m.fecha, "%Y-%m-%d %H:%i") AS fecha,
                COALESCE(u.username, "—") AS usuario
         FROM movimientos_inventario m
         LEFT JOIN usuarios u ON u.id = m.usuario_id
         WHERE m.articulo_id = ?
         ORDER BY m.fecha DESC, m.id DESC'
    );
    $stmt->execute([$articuloId]);
} else {
    $stmt = $db->query(
        'SELECT m.id, m.articulo_id, m.tipo, m.cantidad,
                DATE_FORMAT(m.fecha, "%Y-%m-%d %H:%i") AS fecha,
                COALESCE(u.username, "—") AS usuario,
                a.nombre AS articulo
         FROM movimientos_inventario m
         LEFT JOIN usuarios u ON u.id = m.usuario_id
         LEFT JOIN articulos_inventario a ON a.id = m.articulo_id
         ORDER BY m.fecha DESC, m.id DESC'
    );
}

jsonSuccess(['movimientos' => $stmt->fetchAll()]);