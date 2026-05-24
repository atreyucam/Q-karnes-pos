#!/usr/bin/env node
'use strict';

const path = require('node:path');
const bcrypt = require('bcryptjs');

const argv = new Set(process.argv.slice(2));
const forceCleanUsers = argv.has('--force-clean-users');

process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.ALLOW_DEMO_SEED = 'false';

if (!process.env.DB_FILE && process.env.QKARNES_DATA_DIR) {
  process.env.DB_FILE = path.join(process.env.QKARNES_DATA_DIR, 'qkarnes.sqlite');
}

const db = require('../src/db/knex');

const ADMIN_USER = 'admin';
const ADMIN_PASSWORD = 'admin001';
const CAJERO_USER = 'cajero';
const CAJERO_PASSWORD = 'cajero001';

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

async function ensureRole(trx, roleName) {
  const normalized = String(roleName || '').trim().toUpperCase();
  let role = await trx('roles').whereRaw('UPPER(nombre) = ?', [normalized]).first();
  if (!role) {
    const payload = { nombre: normalized };
    const inserted = await trx('roles').insert(payload);
    const roleId = Array.isArray(inserted) ? inserted[0] : inserted;
    role = await trx('roles').where({ id: roleId }).first();
    if (!role) {
      role = await trx('roles').whereRaw('UPPER(nombre) = ?', [normalized]).first();
    }
  }
  return role;
}

async function upsertBaseUsers(trx) {
  const adminRole = await ensureRole(trx, 'ADMIN');
  const cajeroRole = await ensureRole(trx, 'CAJERO');

  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const cajeroHash = await bcrypt.hash(CAJERO_PASSWORD, 10);

  await trx('usuarios')
    .insert({
      nombre: 'Administrador',
      usuario: ADMIN_USER,
      password_hash: adminHash,
      rol_id: Number(adminRole.id),
      activo: true
    })
    .onConflict('usuario')
    .merge({
      nombre: 'Administrador',
      password_hash: adminHash,
      rol_id: Number(adminRole.id),
      activo: true
    });

  await trx('usuarios')
    .insert({
      nombre: 'Cajero',
      usuario: CAJERO_USER,
      password_hash: cajeroHash,
      rol_id: Number(cajeroRole.id),
      activo: true
    })
    .onConflict('usuario')
    .merge({
      nombre: 'Cajero',
      password_hash: cajeroHash,
      rol_id: Number(cajeroRole.id),
      activo: true
    });
}

async function main() {
  await db.migrate.latest();

  const hasRoles = await db.schema.hasTable('roles');
  const hasUsers = await db.schema.hasTable('usuarios');
  if (!hasRoles || !hasUsers) {
    throw new Error('No existen tablas requeridas (roles/usuarios) luego de migrar.');
  }

  await db.transaction(async (trx) => {
    await ensureRole(trx, 'ADMIN');
    await ensureRole(trx, 'CAJERO');

    const users = await trx('usuarios').select('id', 'usuario');
    const totalUsers = users.length;
    const onlyBaseUsers = users.every((row) => {
      const username = normalizeUsername(row.usuario);
      return username === ADMIN_USER || username === CAJERO_USER;
    });

    if (forceCleanUsers) {
      await trx('usuarios').del();
      await upsertBaseUsers(trx);
      return;
    }

    if (totalUsers === 0) {
      await upsertBaseUsers(trx);
      return;
    }

    if (onlyBaseUsers) {
      const hasAdmin = users.some((row) => normalizeUsername(row.usuario) === ADMIN_USER);
      const hasCajero = users.some((row) => normalizeUsername(row.usuario) === CAJERO_USER);
      if (!hasAdmin || !hasCajero) {
        await upsertBaseUsers(trx);
      }
      return;
    }
  });
}

main()
  .then(async () => {
    await db.destroy();
    console.log('OK: usuarios productivos inicializados.');
  })
  .catch(async (error) => {
    try {
      await db.destroy();
    } catch (_) {}
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  });
