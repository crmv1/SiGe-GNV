<?php
// ============================================================
//  logout.php — Cierre de sesión
//  POST (sin body)
// ============================================================
require_once 'config.php';

session_unset();
session_destroy();

jsonSuccess(['message' => 'Sesión cerrada correctamente.']);
