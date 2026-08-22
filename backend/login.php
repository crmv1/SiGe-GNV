<?php
// ============================================================
//  login.php — Autenticación de usuario
//  POST { username, password }
// ============================================================
require_once 'config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonError(405, 'Método no permitido.');
}

$body = json_decode(file_get_contents('php://input'), true);

$username = trim($body['username'] ?? '');
$password  = trim($body['password']  ?? '');

if (!$username || !$password) {
    jsonError(400, 'Usuario y contraseña son requeridos.');
}

$db   = getDB();
$stmt = $db->prepare('SELECT id, username, password, rol FROM usuarios WHERE username = ? LIMIT 1');
$stmt->execute([$username]);
$user = $stmt->fetch();

if (!$user || !password_verify($password, $user['password'])) {
    jsonError(401, 'Credenciales incorrectas.');
}

// Crear sesión
$_SESSION['user_id']  = $user['id'];
$_SESSION['username'] = $user['username'];
$_SESSION['rol']      = $user['rol'];

jsonSuccess([
    'user' => [
        'id'       => $user['id'],
        'username' => $user['username'],
        'rol'      => $user['rol'],
    ],
]);
