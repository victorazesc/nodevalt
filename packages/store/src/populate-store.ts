import path from "node:path";
import type Database from "better-sqlite3";
import { parseNpmPackageLockFile } from "../../lockfile-parser/src/npm-parser";
import { resolveUserPath } from "../../core/src/paths";
import { ensureNpmPackageInStore } from "./global-store";

export interface PopulateStoreResult {
  resolved: number;
  downloaded: number;
  reused: number;
  skipped: number;
}

export async function populateStoreFromNpmProject(options: {
  db: Database.Database;
  storePath: string;
  projectPath: string;
}): Promise<PopulateStoreResult> {
  const projectPath = resolveUserPath(options.projectPath);
  const lockfilePath = path.join(projectPath, "package-lock.json");
  const lockfile = await parseNpmPackageLockFile(lockfilePath);
  const seen = new Set<string>();

  const result: PopulateStoreResult = {
    resolved: lockfile.packages.length,
    downloaded: 0,
    reused: 0,
    skipped: 0,
  };

  for (const pkg of lockfile.packages) {
    const packageResult = await ensureNpmPackageInStore({
      db: options.db,
      storePath: options.storePath,
      pkg,
    });

    if (seen.has(packageResult.id)) {
      continue;
    }
    seen.add(packageResult.id);

    result[packageResult.status] += 1;
  }

  return result;
}
