import type { NodeValtDatabase } from "./db";

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

export function upsertProject(db: NodeValtDatabase, project: ProjectInput): void {
  const now = new Date().toISOString();
  const existing = db.data.projects.find((row) => row.path === project.path);

  if (existing) {
    Object.assign(existing, {
      name: project.name,
      package_manager: project.packageManager,
      lockfile_path: project.lockfilePath,
      lockfile_hash: project.lockfileHash,
      node_modules_path: project.nodeModulesPath,
      node_modules_size_bytes: project.nodeModulesSizeBytes,
      status: project.status,
      updated_at: now,
    });
  } else {
    db.data.projects.push({
      id: project.id,
      path: project.path,
      name: project.name,
      package_manager: project.packageManager,
      lockfile_path: project.lockfilePath,
      lockfile_hash: project.lockfileHash,
      node_modules_path: project.nodeModulesPath,
      node_modules_size_bytes: project.nodeModulesSizeBytes,
      virtual_node_modules_path: null,
      status: project.status,
      created_at: now,
      updated_at: now,
    });
  }

  db.save();
}

export function listProjects(db: NodeValtDatabase): ProjectRow[] {
  return [...db.data.projects].sort((a, b) => a.path.localeCompare(b.path));
}

export function getProjectStats(db: NodeValtDatabase): {
  count: number;
  totalNodeModulesSizeBytes: number;
} {
  return {
    count: db.data.projects.length,
    totalNodeModulesSizeBytes: db.data.projects.reduce((total, project) => {
      return total + project.node_modules_size_bytes;
    }, 0),
  };
}

export function updateProjectMaterialization(
  db: NodeValtDatabase,
  input: {
    path: string;
    virtualNodeModulesPath: string;
    status: string;
  },
): void {
  const project = db.data.projects.find((row) => row.path === input.path);
  if (!project) {
    return;
  }

  project.virtual_node_modules_path = input.virtualNodeModulesPath;
  project.status = input.status;
  project.updated_at = new Date().toISOString();
  db.save();
}

export function updateProjectStatus(
  db: NodeValtDatabase,
  input: {
    path: string;
    status: string;
  },
): void {
  const project = db.data.projects.find((row) => row.path === input.path);
  if (!project) {
    return;
  }

  project.status = input.status;
  project.updated_at = new Date().toISOString();
  db.save();
}
