import path from "node:path";
import fs from "fs-extra";
import type Database from "better-sqlite3";
import { getStorePaths } from "../../core/src/paths";
import { deletePackage, listPackages } from "../../database/src/packages";
import { readNodeValtLinksManifest } from "../../materializer/src/nodevalt-manifest";
import { getDirectorySizeBytes } from "../../scanner/src/size";

export interface GarbageCollectResult {
  packagesRemoved: number;
  diskFreedBytes: number;
}

export async function collectGarbage(options: {
  db: Database.Database;
  storePath: string;
}): Promise<GarbageCollectResult> {
  const referencedStorePaths = await collectReferencedStorePaths(options.storePath);
  const packages = listPackages(options.db);
  let packagesRemoved = 0;
  let diskFreedBytes = 0;

  for (const pkg of packages) {
    const normalizedStorePath = await normalizeExistingPath(pkg.store_path);
    if (referencedStorePaths.has(normalizedStorePath)) {
      continue;
    }

    const packageRootPath = path.dirname(normalizedStorePath);
    diskFreedBytes += await getDirectorySizeBytes(packageRootPath);
    await fs.remove(packageRootPath);
    deletePackage(options.db, pkg.id);
    packagesRemoved += 1;
  }

  return {
    packagesRemoved,
    diskFreedBytes,
  };
}

async function collectReferencedStorePaths(storePath: string): Promise<Set<string>> {
  const referencedStorePaths = new Set<string>();
  const projectsPath = getStorePaths(storePath).projects;

  if (!(await fs.pathExists(projectsPath))) {
    return referencedStorePaths;
  }

  await walkReferences(projectsPath, referencedStorePaths);

  return referencedStorePaths;
}

async function normalizeExistingPath(inputPath: string): Promise<string> {
  try {
    return await fs.realpath(inputPath);
  } catch {
    return path.resolve(inputPath);
  }
}

async function walkReferences(currentPath: string, referencedStorePaths: Set<string>): Promise<void> {
  let stat: fs.Stats;
  try {
    stat = await fs.lstat(currentPath);
  } catch {
    return;
  }

  if (stat.isSymbolicLink()) {
    try {
      referencedStorePaths.add(await fs.realpath(currentPath));
    } catch {
      return;
    }
    return;
  }

  if (!stat.isDirectory()) {
    return;
  }

  const manifest = await readNodeValtLinksManifest(currentPath);
  if (manifest) {
    for (const storePath of manifest.storePaths) {
      referencedStorePaths.add(await normalizeExistingPath(storePath));
    }
  }

  const entries = await fs.readdir(currentPath);
  await Promise.all(entries.map((entry) => walkReferences(path.join(currentPath, entry), referencedStorePaths)));
}
