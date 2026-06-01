import path from "node:path";
import type { NodeValtDatabase } from "../../database/src/db";
import fs from "fs-extra";
import { getStorePaths, resolveUserPath } from "../../core/src/paths";
import { updateProjectMaterialization } from "../../database/src/projects";
import { upsertPackage } from "../../database/src/packages";
import { getPackageContentId, getPackageStorePath, type StorePackageRef } from "../../store/src/package-paths";
import { activateVirtualNodeModules } from "./activate-node-modules";
import { linkPackageTree } from "./link-package-tree";
import { writeNodeValtLinksManifest } from "./nodevalt-manifest";
import { getProjectMaterializationHash } from "./project-hash";

export interface InstalledNodeModulesMaterializeResult {
  projectPath: string;
  virtualNodeModulesPath: string;
  localNodeModulesPath: string;
  backupPath: string | null;
  packagesCopied: number;
  packagesReused: number;
  packagesLinked: number;
  packagesSkipped: number;
}

interface InstalledPackage {
  name: string;
  version: string;
  packagePath: string;
  relativePath: string;
  isSymlink: boolean;
}

export async function materializeInstalledNodeModules(options: {
  db: NodeValtDatabase;
  storePath: string;
  projectPath: string;
}): Promise<InstalledNodeModulesMaterializeResult> {
  const projectPath = resolveUserPath(options.projectPath);
  const localNodeModulesPath = path.join(projectPath, "node_modules");
  const sourceNodeModulesPath = await getSourceNodeModulesPath(localNodeModulesPath);
  const projectHash = await getProjectMaterializationHash(projectPath);
  const virtualNodeModulesPath = path.join(getStorePaths(options.storePath).projects, projectHash, "node_modules");
  const tmpVirtualNodeModulesPath = `${virtualNodeModulesPath}.tmp-${process.pid}-${Date.now()}`;
  const packages = await listInstalledPackages(sourceNodeModulesPath);

  const result = {
    projectPath,
    virtualNodeModulesPath,
    localNodeModulesPath,
    backupPath: null,
    packagesCopied: 0,
    packagesReused: 0,
    packagesLinked: 0,
    packagesSkipped: 0,
  };

  await fs.remove(tmpVirtualNodeModulesPath);
  await fs.ensureDir(tmpVirtualNodeModulesPath);

  try {
    const referencedStorePaths: string[] = [];

    for (const pkg of packages) {
      const storePackage = await ensureInstalledPackageInStore({
        db: options.db,
        storePath: options.storePath,
        sourceNodeModulesPath,
        pkg,
      });

      if (!storePackage) {
        result.packagesSkipped += 1;
        continue;
      }

      const linkPath = path.join(tmpVirtualNodeModulesPath, pkg.relativePath);
      await fs.ensureDir(path.dirname(linkPath));
      await linkPackageTree(storePackage.path, linkPath);
      referencedStorePaths.push(storePackage.path);

      result[storePackage.reused ? "packagesReused" : "packagesCopied"] += 1;
      result.packagesLinked += 1;
    }

    await writeNodeValtLinksManifest(tmpVirtualNodeModulesPath, referencedStorePaths);
    await copyBinDirectory(sourceNodeModulesPath, tmpVirtualNodeModulesPath);
    await fs.remove(virtualNodeModulesPath);
    await fs.move(tmpVirtualNodeModulesPath, virtualNodeModulesPath);

    const activation = await activateVirtualNodeModules({
      projectPath,
      virtualNodeModulesPath,
    });

    updateProjectMaterialization(options.db, {
      path: projectPath,
      virtualNodeModulesPath,
      status: "materialized",
    });

    return {
      ...result,
      ...activation,
    };
  } catch (error) {
    await fs.remove(tmpVirtualNodeModulesPath);
    throw error;
  }
}

async function getSourceNodeModulesPath(localNodeModulesPath: string): Promise<string> {
  const stat = await fs.lstat(localNodeModulesPath);
  if (!stat.isDirectory() && !stat.isSymbolicLink()) {
    throw new Error("node_modules is not a directory or symlink");
  }

  if (stat.isSymbolicLink()) {
    return fs.realpath(localNodeModulesPath);
  }

  return localNodeModulesPath;
}

async function listInstalledPackages(nodeModulesPath: string): Promise<InstalledPackage[]> {
  const packages: InstalledPackage[] = [];
  const entries = await fs.readdir(nodeModulesPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === ".bin" || entry.name.startsWith(".")) {
      continue;
    }

    const entryPath = path.join(nodeModulesPath, entry.name);
    if (entry.name.startsWith("@") && entry.isDirectory()) {
      const scopedEntries = await fs.readdir(entryPath, { withFileTypes: true });
      for (const scopedEntry of scopedEntries) {
        if (!scopedEntry.isDirectory() && !scopedEntry.isSymbolicLink()) {
          continue;
        }

        const relativePath = path.join(entry.name, scopedEntry.name);
        const pkg = await readInstalledPackage(path.join(entryPath, scopedEntry.name), relativePath, scopedEntry.isSymbolicLink());
        if (pkg) {
          packages.push(pkg);
        }
      }
      continue;
    }

    if (!entry.isDirectory() && !entry.isSymbolicLink()) {
      continue;
    }

    const pkg = await readInstalledPackage(entryPath, entry.name, entry.isSymbolicLink());
    if (pkg) {
      packages.push(pkg);
    }
  }

  return packages;
}

async function readInstalledPackage(
  packagePath: string,
  relativePath: string,
  isSymlink: boolean,
): Promise<InstalledPackage | null> {
  try {
    const packageJson = (await fs.readJson(path.join(packagePath, "package.json"))) as {
      name?: string;
      version?: string;
    };

    if (!packageJson.name || !packageJson.version) {
      return null;
    }

    return {
      name: packageJson.name,
      version: packageJson.version,
      packagePath,
      relativePath,
      isSymlink,
    };
  } catch {
    return null;
  }
}

async function ensureInstalledPackageInStore(options: {
  db: NodeValtDatabase;
  storePath: string;
  sourceNodeModulesPath: string;
  pkg: InstalledPackage;
}): Promise<{ path: string; reused: boolean } | null> {
  const sourcePath = options.pkg.isSymlink ? await fs.realpath(options.pkg.packagePath) : options.pkg.packagePath;
  const ref: StorePackageRef = {
    name: options.pkg.name,
    version: options.pkg.version,
    integrity: null,
    resolved: null,
  };
  const destinationPath = getPackageStorePath(options.storePath, ref);

  const existed = await fs.pathExists(destinationPath);
  if (!existed) {
    await copyPackageToStore(sourcePath, destinationPath);
  }

  upsertPackage(options.db, {
    id: getPackageContentId(ref),
    name: ref.name,
    version: ref.version,
    integrity: ref.integrity,
    resolved: ref.resolved,
    storePath: destinationPath,
  });

  return {
    path: destinationPath,
    reused: existed,
  };
}

async function copyPackageToStore(sourcePath: string, destinationPath: string): Promise<void> {
  const tmpPath = `${destinationPath}.tmp-${process.pid}-${Date.now()}`;

  await fs.ensureDir(path.dirname(destinationPath));
  await fs.remove(tmpPath);
  await fs.copy(sourcePath, tmpPath, {
    dereference: false,
  });
  await fs.move(tmpPath, destinationPath, {
    overwrite: false,
  });
}

async function copyBinDirectory(sourceNodeModulesPath: string, virtualNodeModulesPath: string): Promise<void> {
  const sourceBinPath = path.join(sourceNodeModulesPath, ".bin");
  if (!(await fs.pathExists(sourceBinPath))) {
    return;
  }

  await fs.copy(sourceBinPath, path.join(virtualNodeModulesPath, ".bin"), {
    dereference: false,
  });
}
