import path from "node:path";
import fs from "fs-extra";
import type { ParsedNpmPackage } from "../../lockfile-parser/src/types";

export interface LinkedBin {
  name: string;
  linkPath: string;
  targetPath: string;
}

export async function createBinLinks(options: {
  virtualNodeModulesPath: string;
  packages: ParsedNpmPackage[];
}): Promise<LinkedBin[]> {
  const binDir = path.join(options.virtualNodeModulesPath, ".bin");
  const linkedBins: LinkedBin[] = [];

  for (const pkg of options.packages) {
    if (!isTopLevelPackagePath(pkg.packagePath)) {
      continue;
    }

    for (const [binName, binTarget] of Object.entries(pkg.bin)) {
      if (!isSafeBinName(binName) || path.isAbsolute(binTarget)) {
        continue;
      }

      await fs.ensureDir(binDir);

      const packageRelativePath = pkg.packagePath.slice("node_modules/".length);
      const absoluteTargetPath = path.join(options.virtualNodeModulesPath, packageRelativePath, binTarget);
      const linkPath = path.join(binDir, binName);
      const relativeTargetPath = path.relative(binDir, absoluteTargetPath);

      await fs.remove(linkPath);
      await fs.symlink(relativeTargetPath, linkPath);

      linkedBins.push({
        name: binName,
        linkPath,
        targetPath: absoluteTargetPath,
      });
    }
  }

  return linkedBins;
}

function isTopLevelPackagePath(packagePath: string): boolean {
  if (!packagePath.startsWith("node_modules/")) {
    return false;
  }

  return !packagePath.slice("node_modules/".length).includes("/node_modules/");
}

function isSafeBinName(binName: string): boolean {
  return binName.length > 0 && !binName.includes("/") && !binName.includes("\\");
}
