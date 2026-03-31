const path = require("path");
const Database = require("better-sqlite3");

function initSchema(db) {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS territories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      state_region TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS territory_members (
      territory_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (territory_id, user_id),
      FOREIGN KEY (territory_id) REFERENCES territories(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      territory_id TEXT NOT NULL,
      name TEXT NOT NULL,
      address TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (territory_id) REFERENCES territories(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS trays (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      serial_code TEXT,
      status TEXT NOT NULL DEFAULT 'available',
      is_loaner INTEGER NOT NULL DEFAULT 0,
      owner_territory_id TEXT NOT NULL,
      current_territory_id TEXT NOT NULL,
      current_location_id TEXT,
      loan_state TEXT NOT NULL DEFAULT 'none',
      loan_counterparty_territory_id TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (owner_territory_id) REFERENCES territories(id),
      FOREIGN KEY (current_territory_id) REFERENCES territories(id),
      FOREIGN KEY (current_location_id) REFERENCES locations(id),
      FOREIGN KEY (loan_counterparty_territory_id) REFERENCES territories(id)
    );

    CREATE TABLE IF NOT EXISTS transfers (
      id TEXT PRIMARY KEY,
      tray_id TEXT NOT NULL,
      from_territory_id TEXT NOT NULL,
      to_territory_id TEXT NOT NULL,
      from_location_id TEXT,
      to_location_id TEXT,
      transfer_type TEXT NOT NULL,
      notes TEXT,
      created_by_user_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (tray_id) REFERENCES trays(id) ON DELETE CASCADE,
      FOREIGN KEY (from_territory_id) REFERENCES territories(id),
      FOREIGN KEY (to_territory_id) REFERENCES territories(id),
      FOREIGN KEY (from_location_id) REFERENCES locations(id),
      FOREIGN KEY (to_location_id) REFERENCES locations(id),
      FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS scan_events (
      id TEXT PRIMARY KEY,
      tray_id TEXT,
      territory_id TEXT,
      user_id TEXT,
      scan_type TEXT NOT NULL,
      raw_value TEXT NOT NULL,
      parsed_serial TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (tray_id) REFERENCES trays(id),
      FOREIGN KEY (territory_id) REFERENCES territories(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_locations_territory ON locations (territory_id);
    CREATE INDEX IF NOT EXISTS idx_trays_owner_territory ON trays (owner_territory_id);
    CREATE INDEX IF NOT EXISTS idx_trays_current_territory ON trays (current_territory_id);
    CREATE INDEX IF NOT EXISTS idx_transfers_tray ON transfers (tray_id);
    CREATE INDEX IF NOT EXISTS idx_scan_events_tray ON scan_events (tray_id);
  `);
}

function createDb(dbPath = path.join(__dirname, "..", "data", "traytrack.db")) {
  const db = new Database(dbPath);
  initSchema(db);
  return db;
}

module.exports = {
  createDb,
  initSchema,
};
