import path from "node:path";
import fs from "fs-extra";
import type Database from "better-sqlite3";
import { resolveUserPath } from "../../core/src/paths";
import { updateProjectStatus } from "../../database/src/projects";
import { isNodeValtManagedNodeModules } from "./activate-node-modules";

export interface RestoreProjectResult {
  projectPath: string;
  restoredFrom: string;
  nodeModulesPath: string;
}

export async function restoreProjectNodeModules(options: {
  db: Database.Database;
  projectPath: string;
}): Promise<RestoreProjectResult> {
  const projectPath = resolveUserPath(options.projectPath);
  const nodeModulesPath = path.join(projectPath, "node_modules");
  const backupPath = await findLatestBackup(projectPath);

  if (!backupPath) {
    throw new Error("No node_modules backup found");
  }

  if (await fs.pathExists(nodeModulesPath)) {
    const stat = await fs.lstat(nodeModulesPath);
    const canRemove = stat.isSymbolicLink() || (stat.isDirectory() && (await isNodeValtManagedNodeModules(nodeModulesPath)));
    if (!canRemove) {
      throw new Error("Cannot restore because node_modules exists and is not managed by NodeValt");
    }

    await fs.remove(nodeModulesPath);
  }

  await fs.move(backupPath, nodeModulesPath, {
    overwrite: false,
  });

  updateProjectStatus(options.db, {
    path: projectPath,
    status: "restored",
  });

  return {
    projectPath,
    restoredFrom: backupPath,
    nodeModulesPath,
  };
}

async function findLatestBackup(projectPath: string): Promise<string | null> {
  const entries = await fs.readdir(projectPath, { withFileTypes: true });
  const backups = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .filter((entry) => entry.name.startsWith("node_modules.nodevalt-backup-"))
      .map(async (entry) => {
        const backupPath = path.join(projectPath, entry.name);
        const stat = await fs.stat(backupPath);
        return {
          path: backupPath,
          mtimeMs: stat.mtimeMs,
        };
      }),
  );

  return backups.sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.path ?? null;
}
