import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "fs-extra";
import { getStorePaths } from "../../core/src/paths";
import { verifyIntegrity } from "./integrity";

const execFileAsync = promisify(execFile);

export async function fetchPackageToStore(options: {
  storePath: string;
  resolved: string;
  integrity: string;
  destinationPath: string;
}): Promise<void> {
  const storePaths = getStorePaths(options.storePath);
  const tmpRoot = await fs.mkdtemp(path.join(storePaths.tmp, "pkg-"));
  const tarballPath = path.join(tmpRoot, "package.tgz");
  const extractPath = path.join(tmpRoot, "extract");

  try {
    const tarball = await downloadTarball(options.resolved);
    verifyIntegrity(tarball, options.integrity);

    await fs.writeFile(tarballPath, tarball);
    await fs.ensureDir(extractPath);
    await execFileAsync("tar", ["-xzf", tarballPath, "-C", extractPath]);

    const extractedPackagePath = path.join(extractPath, "package");
    if (!(await fs.pathExists(extractedPackagePath))) {
      throw new Error("Invalid package tarball: missing package directory");
    }

    await fs.ensureDir(path.dirname(options.destinationPath));
    await fs.move(extractedPackagePath, options.destinationPath, {
      overwrite: false,
    });
  } finally {
    await fs.remove(tmpRoot);
  }
}

async function downloadTarball(resolved: string): Promise<Buffer> {
  const response = await fetch(resolved);

  if (!response.ok) {
    throw new Error(`Failed to download package: ${response.status} ${response.statusText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}
