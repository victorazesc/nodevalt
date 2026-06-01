import type { NodeValtDatabase } from "./db";

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

export function upsertPackage(db: NodeValtDatabase, input: PackageInput): void {
  const now = new Date().toISOString();
  const existing = db.data.packages.find((row) => row.id === input.id);

  if (existing) {
    Object.assign(existing, {
      name: input.name,
      version: input.version,
      integrity: input.integrity,
      resolved: input.resolved,
      store_path: input.storePath,
      updated_at: now,
    });
  } else {
    db.data.packages.push({
      id: input.id,
      name: input.name,
      version: input.version,
      integrity: input.integrity,
      resolved: input.resolved,
      store_path: input.storePath,
      created_at: now,
      updated_at: now,
    });
  }

  db.save();
}

export function getPackageCount(db: NodeValtDatabase): number {
  return db.data.packages.length;
}

export function listPackages(db: NodeValtDatabase): PackageRow[] {
  return [...db.data.packages].sort((a, b) => {
    const nameOrder = a.name.localeCompare(b.name);
    return nameOrder === 0 ? a.version.localeCompare(b.version) : nameOrder;
  });
}

export function deletePackage(db: NodeValtDatabase, id: string): void {
  db.data.packages = db.data.packages.filter((pkg) => pkg.id !== id);
  db.save();
}
