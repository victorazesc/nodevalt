import path from "node:path";
import fs from "fs-extra";

export async function getDirectorySizeBytes(targetPath: string): Promise<number> {
  try {
    const stat = await fs.lstat(targetPath);

    if (stat.isSymbolicLink()) {
      return stat.size;
    }

    if (!stat.isDirectory()) {
      return stat.size;
    }

    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    const sizes = await Promise.all(
      entries.map((entry) => getDirectorySizeBytes(path.join(targetPath, entry.name))),
    );

    return sizes.reduce((total, size) => total + size, 0);
  } catch {
    return 0;
  }
}
