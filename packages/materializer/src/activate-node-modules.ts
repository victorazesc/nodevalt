import path from "node:path";
import fs from "fs-extra";
import { linkPackageTree } from "./link-package-tree";

export const NODEVALT_MARKER_FILE = ".nodevalt.json";

export interface ActivateNodeModulesResult {
  localNodeModulesPath: string;
  backupPath: string | null;
}

export async function activateVirtualNodeModules(options: {
  projectPath: string;
  virtualNodeModulesPath: string;
}): Promise<ActivateNodeModulesResult> {
  const localNodeModulesPath = path.join(options.projectPath, "node_modules");
  const backupPath = await backupExistingNodeModules(localNodeModulesPath);

  await linkPackageTree(options.virtualNodeModulesPath, localNodeModulesPath);
  await writeNodeValtMarker(localNodeModulesPath, options.virtualNodeModulesPath);

  return {
    localNodeModulesPath,
    backupPath,
  };
}

async function backupExistingNodeModules(localNodeModulesPath: string): Promise<string | null> {
  if (!(await fs.pathExists(localNodeModulesPath))) {
    return null;
  }

  const stat = await fs.lstat(localNodeModulesPath);
  if (stat.isSymbolicLink()) {
    await fs.remove(localNodeModulesPath);
    return null;
  }

  if (!stat.isDirectory()) {
    throw new Error("Cannot replace node_modules because it is not a directory or symlink");
  }

  if (await isNodeValtManagedNodeModules(localNodeModulesPath)) {
    await fs.remove(localNodeModulesPath);
    return null;
  }

  const backupPath = `${localNodeModulesPath}.nodevalt-backup-${formatBackupTimestamp(new Date())}`;
  await fs.move(localNodeModulesPath, backupPath, {
    overwrite: false,
  });

  return backupPath;
}

function formatBackupTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}

export async function isNodeValtManagedNodeModules(nodeModulesPath: string): Promise<boolean> {
  return fs.pathExists(path.join(nodeModulesPath, NODEVALT_MARKER_FILE));
}

async function writeNodeValtMarker(nodeModulesPath: string, virtualNodeModulesPath: string): Promise<void> {
  await fs.writeJson(
    path.join(nodeModulesPath, NODEVALT_MARKER_FILE),
    {
      managedBy: "nodevalt",
      strategy: "hardlink-tree",
      virtualNodeModulesPath,
      createdAt: new Date().toISOString(),
    },
    {
      spaces: 2,
    },
  );
}
