<?php
// ============================================================
//  generate_hashes.php
//  Ejecutar UNA VEZ para generar los hashes correctos y
//  actualizar la base de datos si es necesario.
//  php generate_hashes.php
// ============================================================

$usuarios = [
    ['username' => 'tecnico',       'password' => 'tecnico123', 'rol' => 'tecnico'],
    ['username' => 'administrador', 'password' => 'admin123',   'rol' => 'administrador'],
];

echo "=== Hashes para insertar en MySQL ===\n\n";
foreach ($usuarios as $u) {
    $hash = password_hash($u['password'], PASSWORD_BCRYPT);
    echo "INSERT INTO usuarios (username, password, rol) VALUES\n";
    echo "  ('{$u['username']}', '{$hash}', '{$u['rol']}');\n\n";
}

echo "Verificación:\n";
foreach ($usuarios as $u) {
    $hash   = password_hash($u['password'], PASSWORD_BCRYPT);
    $ok     = password_verify($u['password'], $hash) ? 'OK' : 'FALLO';
    echo "  {$u['username']} ({$u['password']}): {$ok}\n";
}
