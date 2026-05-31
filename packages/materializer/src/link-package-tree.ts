import path from "node:path";
import fs from "fs-extra";

export async function linkPackageTree(sourcePath: string, destinationPath: string): Promise<void> {
  const stat = await fs.lstat(sourcePath);

  if (stat.isSymbolicLink()) {
    const targetPath = await fs.readlink(sourcePath);
    await fs.ensureDir(path.dirname(destinationPath));
    await fs.symlink(targetPath, destinationPath);
    return;
  }

  if (stat.isDirectory()) {
    await fs.ensureDir(destinationPath);
    const entries = await fs.readdir(sourcePath);
    await Promise.all(
      entries.map((entry) => linkPackageTree(path.join(sourcePath, entry), path.join(destinationPath, entry))),
    );
    return;
  }

  await fs.ensureDir(path.dirname(destinationPath));
  try {
    await fs.link(sourcePath, destinationPath);
  } catch (error) {
    if (isCrossDeviceLinkError(error)) {
      await fs.copyFile(sourcePath, destinationPath);
      return;
    }

    throw error;
  }
}

function isCrossDeviceLinkError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "EXDEV";
}
