import type Database from "better-sqlite3";

export interface PackageInput {
  id: string;
  name: string;
  version: string;
  integrity: string | null;
  resolved: string | null;
  storePath: string;
}

export interface PackageRow {
  id: string;
  name: string;
  version: string;
  integrity: string | null;
  resolved: string | null;
  store_path: string;
  created_at: string;
  updated_at: string;
}

export function upsertPackage(db: Database.Database, input: PackageInput): void {
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO packages (
      id,
      name,
      version,
      integrity,
      resolved,
      store_path,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @name,
      @version,
      @integrity,
      @resolved,
      @storePath,
      @now,
      @now
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      version = excluded.version,
      integrity = excluded.integrity,
      resolved = excluded.resolved,
      store_path = excluded.store_path,
      updated_at = excluded.updated_at
  `).run({ ...input, now });
}

export function getPackageCount(db: Database.Database): number {
  const row = db.prepare("SELECT COUNT(*) AS count FROM packages").get() as { count: number };
  return row.count;
}
