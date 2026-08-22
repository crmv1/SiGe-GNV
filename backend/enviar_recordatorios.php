<?php
// ============================================================
//  enviar_recordatorios.php
//  Envía mensajes de WhatsApp usando wpp.connect
//  Ejecutar vía cron: php /ruta/al/backend/enviar_recordatorios.php
//  O llamar desde el frontend al cargar la pantalla principal.
// ============================================================
require_once __DIR__ . '/config.php';

// ----- Configuración de wpp.connect ------------------------
// Permitir acceso con clave secreta (para cron y wpp.connect)
$clave = $_GET['key'] ?? '';
if ($clave !== 'gnv2024secreto') {
    requireAuth(); // Si no hay clave, exige sesión normal
}
define('WPPCONNECT_URL',    'http://localhost:21465'); // URL del servidor wpp.connect
define('WPPCONNECT_TOKEN',  'TU_TOKEN_AQUI');          // Generado al iniciar wpp.connect
define('WPPCONNECT_SESSION','gnv-taller');             // Nombre de sesión

/**
 * Envía un mensaje de texto usando la API REST de wpp.connect.
 */
function enviarWhatsApp(string $numero, string $mensaje): bool {
    // Normalizar número: agregar @c.us si no lo tiene
    $numero = preg_replace('/[^0-9]/', '', $numero);
    if (!str_ends_with($numero, '@c.us')) {
        $numero .= '@c.us';
    }

    $url     = WPPCONNECT_URL . '/api/' . WPPCONNECT_SESSION . '/send-message';
    $payload = json_encode(['phone' => $numero, 'message' => $mensaje, 'isGroup' => false]);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . WPPCONNECT_TOKEN,
        ],
        CURLOPT_TIMEOUT        => 10,
    ]);
    $response = curl_exec($ch);
    $err      = curl_error($ch);
    curl_close($ch);

    if ($err) {
        error_log("[GNV-WhatsApp] cURL error: {$err}");
        return false;
    }

    $data = json_decode($response, true);
    return isset($data['status']) && $data['status'] === 'success';
}

/**
 * Registra el envío para evitar duplicados.
 */
function registrarEnvio(PDO $db, int $vehiculoId, string $tipo): void {
    $stmt = $db->prepare(
        'INSERT IGNORE INTO recordatorios_enviados (vehiculo_id, tipo) VALUES (?, ?)'
    );
    $stmt->execute([$vehiculoId, $tipo]);
}

/**
 * Verifica si ya se envió el recordatorio.
 */
function yaEnviado(PDO $db, int $vehiculoId, string $tipo): bool {
    $stmt = $db->prepare(
        'SELECT id FROM recordatorios_enviados WHERE vehiculo_id = ? AND tipo = ? LIMIT 1'
    );
    $stmt->execute([$vehiculoId, $tipo]);
    return (bool)$stmt->fetch();
}

// ============================================================
//  PROCESO PRINCIPAL
// ============================================================
$db  = getDB();
$hoy = new DateTimeImmutable('today');

// Obtener vehículos con fechas próximas
$vehiculos = $db->query(
    'SELECT id, nombre, apellido, telefono,
            fecha_recalificacion, fecha_inspeccion
     FROM vehiculos'
)->fetchAll();

$enviados = 0;
$errores  = 0;

foreach ($vehiculos as $v) {
    $fechaRecal = new DateTimeImmutable($v['fecha_recalificacion']);
    $fechaInsp  = new DateTimeImmutable($v['fecha_inspeccion']);
    $nombreCompleto = $v['nombre'] . ' ' . $v['apellido'];

    // --- RECALIFICACIÓN: avisar 2 meses (60 días) antes ---
    $diasRecal = (int)$hoy->diff($fechaRecal)->days;
    if ($hoy <= $fechaRecal && $diasRecal <= 60 && !yaEnviado($db, $v['id'], 'recalificacion')) {
        $fechaFormato = date('d/m/Y', strtotime($v['fecha_recalificacion']));
        $mensaje = "Hola {$nombreCompleto}, recordatorio: la recalificación de tu cilindro GNV vence el {$fechaFormato}. Agenda tu cita en nuestro taller. 🔧";

        if (enviarWhatsApp($v['telefono'], $mensaje)) {
            registrarEnvio($db, $v['id'], 'recalificacion');
            echo "[OK] Recalificación enviada a {$nombreCompleto} ({$v['telefono']})\n";
            $enviados++;
        } else {
            echo "[ERR] Falló envío recalificación a {$nombreCompleto}\n";
            $errores++;
        }
    }

    // --- INSPECCIÓN: avisar 10 días antes ---
    $diasInsp = (int)$hoy->diff($fechaInsp)->days;
    if ($hoy <= $fechaInsp && $diasInsp <= 10 && !yaEnviado($db, $v['id'], 'inspeccion')) {
        $fechaFormato = date('d/m/Y', strtotime($v['fecha_inspeccion']));
        $mensaje = "Hola {$nombreCompleto}, tu inspección anual GNV vence el {$fechaFormato}. No dejes pasar la fecha. ¡Te esperamos! 📋";

        if (enviarWhatsApp($v['telefono'], $mensaje)) {
            registrarEnvio($db, $v['id'], 'inspeccion');
            echo "[OK] Inspección enviada a {$nombreCompleto} ({$v['telefono']})\n";
            $enviados++;
        } else {
            echo "[ERR] Falló envío inspección a {$nombreCompleto}\n";
            $errores++;
        }
    }
}

$resumen = ['enviados' => $enviados, 'errores' => $errores];
echo json_encode($resumen) . "\n";

// Si se llama desde HTTP (no CLI), devolver JSON limpio
if (php_sapi_name() !== 'cli') {
    // Solo accesible con sesión activa
    requireAuth();
    header('Content-Type: application/json');
    echo json_encode(['success' => true] + $resumen);
}
