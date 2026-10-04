#!/usr/bin/env node
// ============================================================
//  scripts/set-user-password.js
//  Establece la contrasena de un usuario con hash bcrypt.
//
//  Se creo porque al revisar los hashes de `gnv_taller.usuarios`
//  se comprobo que el hash guardado para el usuario `tecnico`
//  NO corresponde a la contrasena que genera
//  backend/generate_hashes.php ('tecnico123'). El de
//  `administrador` si coincide con 'admin123'.
//
//  Es decir: la contrasena de `tecnico` en la base no es
//  `tecnico123`. Puede haberse cambiado en phpMyAdmin o que el
//  hash del dump este desactualizado. Este script la fija de
//  nuevo sin necesidad de conocer la anterior.
//
//  NO escribe contrasenas en claro en la base: genera el hash.
//
//  Uso:
//    npm run user:password -- tecnico MiClaveNueva
//    npm run user:password -- administrador OtraClave
//
//  Si se omite la contrasena, se genera una aleatoria y se
//  muestra en pantalla para que la copies.
// ============================================================
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { query, queryOne, closePool } from '../src/config/database.js';

const [, , username, passwordArg] = process.argv;

if (!username) {
  console.error('Uso: npm run user:password -- <usuario> [contrasena]');
  console.error('Ejemplo: npm run user:password -- tecnico MiClaveNueva');
  process.exit(1);
}

const password = passwordArg ?? crypto.randomBytes(9).toString('base64url');

async function main() {
  const usuario = await queryOne(
    'SELECT id, username, rol FROM usuarios WHERE username = ? LIMIT 1',
    [username]
  );

  if (!usuario) {
    console.error(`No existe ningun usuario con el nombre "${username}".`);
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);

  await query('UPDATE usuarios SET password = ? WHERE id = ?', [hash, usuario.id]);

  // Comprobacion: el hash recien escrito debe validar.
  const verifica = await bcrypt.compare(password, hash);

  console.log('');
  console.log(`Usuario  : ${usuario.username} (${usuario.rol})`);
  console.log(`Hash     : ${hash.slice(0, 7)}...  (bcrypt, 10 rondas)`);
  console.log(`Verifica : ${verifica ? 'OK' : 'FALLO'}`);

  if (!passwordArg) {
    console.log('');
    console.log('Contrasena generada (copiala ahora, no se vuelve a mostrar):');
    console.log(`   ${password}`);
  }

  console.log('');
}

main()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(`Error: ${error.code || error.name} - ${error.message}`);
    await closePool().catch(() => {});
    process.exit(1);
  });
