<?php
// ============================================================
//  verificar_permiso.php — Devuelve el estado de sesión actual
//  GET (sin parámetros)
// ============================================================
require_once 'config.php';

$user = requireAuth(); // devuelve datos o corta con 401

jsonSuccess(['user' => $user]);
