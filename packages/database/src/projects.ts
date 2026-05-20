import type Database from "better-sqlite3";

export interface ProjectRow {
  id: string;
  path: string;
  name: string | null;
  package_manager: string;
  lockfile_path: string | null;
  lockfile_hash: string | null;
  node_modules_path: string;
  node_modules_size_bytes: number;
  virtual_node_modules_path: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectInput {
  id: string;
  path: string;
  name: string | null;
  packageManager: string;
  lockfilePath: string | null;
  lockfileHash: string | null;
  nodeModulesPath: string;
  nodeModulesSizeBytes: number;
  status: string;
}

export function upsertProject(db: Database.Database, project: ProjectInput): void {
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO projects (
      id,
      path,
      name,
      package_manager,
      lockfile_path,
      lockfile_hash,
      node_modules_path,
      node_modules_size_bytes,
      virtual_node_modules_path,
      status,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @path,
      @name,
      @packageManager,
      @lockfilePath,
      @lockfileHash,
      @nodeModulesPath,
      @nodeModulesSizeBytes,
      NULL,
      @status,
      @now,
      @now
    )
    ON CONFLICT(path) DO UPDATE SET
      name = excluded.name,
      package_manager = excluded.package_manager,
      lockfile_path = excluded.lockfile_path,
      lockfile_hash = excluded.lockfile_hash,
      node_modules_path = excluded.node_modules_path,
      node_modules_size_bytes = excluded.node_modules_size_bytes,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).run({ ...project, now });
}

export function listProjects(db: Database.Database): ProjectRow[] {
  return db.prepare("SELECT * FROM projects ORDER BY path").all() as ProjectRow[];
}

export function getProjectStats(db: Database.Database): {
  count: number;
  totalNodeModulesSizeBytes: number;
} {
  const row = db
    .prepare(
      "SELECT COUNT(*) AS count, COALESCE(SUM(node_modules_size_bytes), 0) AS totalNodeModulesSizeBytes FROM projects",
    )
    .get() as { count: number; totalNodeModulesSizeBytes: number };

  return row;
}

export function updateProjectMaterialization(
  db: Database.Database,
  input: {
    path: string;
    virtualNodeModulesPath: string;
    status: string;
  },
): void {
  db.prepare(`
    UPDATE projects
    SET
      virtual_node_modules_path = @virtualNodeModulesPath,
      status = @status,
      updated_at = @now
    WHERE path = @path
  `).run({
    ...input,
    now: new Date().toISOString(),
  });
}
