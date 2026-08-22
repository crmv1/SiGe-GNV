<?php
// ============================================================
//  config.php — Configuración central del backend
// ============================================================

// ----- Base de datos ----------------------------------------
define('DB_HOST', 'localhost');
define('DB_NAME', 'gnv_taller');
define('DB_USER', 'root');        // ← Cambia según tu entorno
define('DB_PASS', '');            // ← Cambia según tu entorno
define('DB_CHARSET', 'utf8mb4');

// ----- CORS (ajusta el origen según tu frontend) -----------
$allowedOrigin = 'http://localhost:5173';  // Vite dev server

// ----- Sesión -----------------------------------------------
session_start();

// ----- Cabeceras HTTP ---------------------------------------
header("Access-Control-Allow-Origin: {$allowedOrigin}");
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=UTF-8');

// Responder preflight OPTIONS inmediatamente
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ============================================================
//  Función: obtener conexión PDO (singleton ligero)
// ============================================================
function getDB(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = sprintf('mysql:host=%s;dbname=%s;charset=%s', DB_HOST, DB_NAME, DB_CHARSET);
        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ];
        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        } catch (PDOException $e) {
            jsonError(500, 'Error de conexión a la base de datos: ' . $e->getMessage());
        }
    }
    return $pdo;
}

// ============================================================
//  Helpers de respuesta JSON
// ============================================================
function jsonSuccess(array $data = [], int $code = 200): void {
    http_response_code($code);
    echo json_encode(['success' => true] + $data, JSON_UNESCAPED_UNICODE);
    exit;
}

function jsonError(int $code, string $message): never {
    http_response_code($code);
    echo json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

// ============================================================
//  Verificar sesión activa (llamar en endpoints protegidos)
// ============================================================
function requireAuth(): array {
    if (empty($_SESSION['user_id'])) {
        jsonError(401, 'No autenticado. Inicia sesión.');
    }
    return [
        'id'       => $_SESSION['user_id'],
        'username' => $_SESSION['username'],
        'rol'      => $_SESSION['rol'],
    ];
}

// ============================================================
//  Verificar rol de administrador
// ============================================================
function requireAdmin(): void {
    $user = requireAuth();
    if ($user['rol'] !== 'administrador') {
        jsonError(403, 'No tienes permisos para realizar esta acción.');
    }
}
