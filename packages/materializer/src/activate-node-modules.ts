import path from "node:path";
import fs from "fs-extra";

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

  await fs.symlink(options.virtualNodeModulesPath, localNodeModulesPath, "dir");

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

  const backupPath = `${localNodeModulesPath}.nodevalt-backup-${formatBackupTimestamp(new Date())}`;
  await fs.move(localNodeModulesPath, backupPath, {
    overwrite: false,
  });

  return backupPath;
}

function formatBackupTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}
