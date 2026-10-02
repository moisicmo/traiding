// Base de datos SQLite: un solo archivo en DATA_DIR (en Docker, un volumen en /app/data).
// Usa el SQLite que ya trae Node 24 (node:sqlite): no hay que instalar ni compilar nada.
import 'server-only'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const globalForDb = globalThis as unknown as { tradingDb?: DatabaseSync }

export function db(): DatabaseSync {
  if (!globalForDb.tradingDb) {
    const dir = process.env.DATA_DIR ?? path.join(process.cwd(), 'data')
    fs.mkdirSync(dir, { recursive: true })
    const database = new DatabaseSync(path.join(dir, 'trading.db'))
    database.exec('PRAGMA journal_mode = WAL')
    migrate(database)
    globalForDb.tradingDb = database
  }
  return globalForDb.tradingDb
}

function migrate(database: DatabaseSync) {
  database.exec(`
    -- Tus órdenes de Binance: las que siguen abiertas y el historial de las que terminaron
    CREATE TABLE IF NOT EXISTS orders (
      symbol       TEXT    NOT NULL,
      order_id     INTEGER NOT NULL,
      side         TEXT    NOT NULL, -- BUY | SELL
      type         TEXT    NOT NULL, -- LIMIT, STOP_LOSS_LIMIT, ...
      price        REAL    NOT NULL,
      stop_price   REAL    NOT NULL DEFAULT 0,
      orig_qty     REAL    NOT NULL,
      executed_qty REAL    NOT NULL DEFAULT 0,
      quote_qty    REAL    NOT NULL DEFAULT 0, -- USDT gastados/recibidos en lo ejecutado
      status       TEXT    NOT NULL, -- NEW, PARTIALLY_FILLED, FILLED, CANCELED, EXPIRED
      created_at   INTEGER NOT NULL, -- ms
      updated_at   INTEGER NOT NULL, -- ms
      PRIMARY KEY (symbol, order_id)
    );

    -- Datos sueltos: última sincronización, último error, etc.
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
}

export function getMeta(key: string): string | null {
  const row = db().prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setMeta(key: string, value: string) {
  db().prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}

export function deleteMeta(key: string) {
  db().prepare('DELETE FROM meta WHERE key = ?').run(key)
}
