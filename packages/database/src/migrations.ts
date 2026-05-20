import type Database from "better-sqlite3";

export function runMigrations(db: Database.Database): void {
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      name TEXT,
      package_manager TEXT,
      lockfile_path TEXT,
      lockfile_hash TEXT,
      node_modules_path TEXT,
      node_modules_size_bytes INTEGER DEFAULT 0,
      virtual_node_modules_path TEXT,
      status TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS packages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      integrity TEXT,
      resolved TEXT,
      store_path TEXT NOT NULL,
      created_at TEXT,
      updated_at TEXT
    );
  `);
}
