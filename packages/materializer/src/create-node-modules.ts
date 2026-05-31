import path from "node:path";
import fs from "fs-extra";
import type { ParsedNpmPackage } from "../../lockfile-parser/src/types";
import type { EnsurePackageResult } from "../../store/src/global-store";
import { linkPackageTree } from "./link-package-tree";
import { writeNodeValtLinksManifest } from "./nodevalt-manifest";

export interface LinkedPackage {
  name: string;
  version: string;
  packagePath: string;
  linkPath: string;
  targetPath: string;
}

export async function createVirtualNodeModules(options: {
  virtualNodeModulesPath: string;
  packages: ParsedNpmPackage[];
  storePackages: Map<string, EnsurePackageResult>;
}): Promise<LinkedPackage[]> {
  await fs.remove(options.virtualNodeModulesPath);
  await fs.ensureDir(options.virtualNodeModulesPath);

  const linkedPackages: LinkedPackage[] = [];

  for (const pkg of options.packages) {
    const storePackage = options.storePackages.get(pkg.packagePath);
    if (!storePackage || storePackage.status === "skipped") {
      continue;
    }

    const relativePackagePath = getRelativePackagePath(pkg.packagePath);
    if (!relativePackagePath) {
      continue;
    }

    const linkPath = path.join(options.virtualNodeModulesPath, relativePackagePath);
    await fs.ensureDir(path.dirname(linkPath));
    await fs.remove(linkPath);
    await linkPackageTree(storePackage.storePath, linkPath);

    linkedPackages.push({
      name: pkg.name,
      version: pkg.version,
      packagePath: pkg.packagePath,
      linkPath,
      targetPath: storePackage.storePath,
    });
  }

  await writeNodeValtLinksManifest(
    options.virtualNodeModulesPath,
    linkedPackages.map((pkg) => pkg.targetPath),
  );

  return linkedPackages;
}

function getRelativePackagePath(packagePath: string): string | null {
  if (!packagePath.startsWith("node_modules/")) {
    return null;
  }

  return packagePath.slice("node_modules/".length);
}
