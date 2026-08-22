<?php
// chatbot_webhook.php
require_once __DIR__ . '/config.php';

// Solo POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(200);
    exit;
}

$body      = json_decode(file_get_contents('php://input'), true);
$evento    = $body['event']  ?? '';
$mensaje   = $body['text']   ?? $body['body'] ?? '';
$remitente = $body['from']   ?? '';

if ($evento !== 'onmessage' || empty($mensaje) || empty($remitente)) {
    http_response_code(200);
    echo json_encode(['status' => 'ignored']);
    exit;
}

// Limpiar y normalizar posible placa
$placa = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', trim($mensaje)));

$db   = getDB();
$stmt = $db->prepare(
    'SELECT nombre, apellido, placa,
            DATE_FORMAT(fecha_recalificacion, "%d/%m/%Y") AS recal,
            DATE_FORMAT(fecha_inspeccion,     "%d/%m/%Y") AS insp
     FROM vehiculos WHERE placa = ? LIMIT 1'
);
$stmt->execute([$placa]);
$v = $stmt->fetch();

if ($v) {
    // Encontró el vehículo — respuesta estática + contexto para IA
    $respuesta =
        "🚗 *Consulta GNV — Placa: {$v['placa']}*\n\n" .
        "Propietario: {$v['nombre']} {$v['apellido']}\n" .
        "📅 Recalificación: {$v['recal']}\n" .
        "🔍 Inspección anual: {$v['insp']}\n\n" .
        "¿Tienes alguna pregunta sobre tu vehículo? Puedo ayudarte. 😊";

    http_response_code(200);
    echo json_encode([
        'status'    => 'ok',
        'respuesta' => $respuesta,
        'vehiculo'  => [
            'nombre'   => $v['nombre'],
            'apellido' => $v['apellido'],
            'placa'    => $v['placa'],
            'recal'    => $v['recal'],
            'insp'     => $v['insp'],
        ],
    ]);

} else {
    // No encontró placa — dejar que la IA responda la pregunta libre
    http_response_code(200);
    echo json_encode([
        'status'    => 'ok',
        'respuesta' => null,   // null = Node usará IA
        'vehiculo'  => null,
    ]);
}
