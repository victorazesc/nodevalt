import path from "node:path";
import type Database from "better-sqlite3";
import { getStorePaths, resolveUserPath } from "../../core/src/paths";
import { updateProjectMaterialization } from "../../database/src/projects";
import { parseNpmPackageLockFile } from "../../lockfile-parser/src/npm-parser";
import { ensureNpmPackageInStore, type EnsurePackageResult } from "../../store/src/global-store";
import { createVirtualNodeModules, type LinkedPackage } from "./create-node-modules";
import { getProjectMaterializationHash } from "./project-hash";

export interface MaterializeProjectResult {
  projectPath: string;
  virtualNodeModulesPath: string;
  packagesResolved: number;
  packagesDownloaded: number;
  packagesReused: number;
  packagesSkipped: number;
  packagesLinked: number;
  linkedPackages: LinkedPackage[];
}

export async function materializeNpmProjectVirtual(options: {
  db: Database.Database;
  storePath: string;
  projectPath: string;
}): Promise<MaterializeProjectResult> {
  const projectPath = resolveUserPath(options.projectPath);
  const lockfilePath = path.join(projectPath, "package-lock.json");
  const lockfile = await parseNpmPackageLockFile(lockfilePath);
  const projectHash = await getProjectMaterializationHash(projectPath);
  const virtualNodeModulesPath = path.join(getStorePaths(options.storePath).projects, projectHash, "node_modules");
  const storePackages = new Map<string, EnsurePackageResult>();

  const result: MaterializeProjectResult = {
    projectPath,
    virtualNodeModulesPath,
    packagesResolved: lockfile.packages.length,
    packagesDownloaded: 0,
    packagesReused: 0,
    packagesSkipped: 0,
    packagesLinked: 0,
    linkedPackages: [],
  };

  for (const pkg of lockfile.packages) {
    const storePackage = await ensureNpmPackageInStore({
      db: options.db,
      storePath: options.storePath,
      pkg,
    });
    storePackages.set(pkg.packagePath, storePackage);
    result[storePackage.status === "downloaded" ? "packagesDownloaded" : storePackage.status === "reused" ? "packagesReused" : "packagesSkipped"] += 1;
  }

  result.linkedPackages = await createVirtualNodeModules({
    virtualNodeModulesPath,
    packages: lockfile.packages,
    storePackages,
  });
  result.packagesLinked = result.linkedPackages.length;

  updateProjectMaterialization(options.db, {
    path: projectPath,
    virtualNodeModulesPath,
    status: "virtualized",
  });

  return result;
}
