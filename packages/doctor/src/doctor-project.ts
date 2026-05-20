import path from "node:path";
import fs from "fs-extra";
import { hashFile, resolveUserPath } from "../../core/src/paths";
import { parseNpmPackageLockFile } from "../../lockfile-parser/src/npm-parser";
import { getPackageStorePath } from "../../store/src/package-paths";

export type DoctorSeverity = "error" | "warning";

export interface DoctorIssue {
  severity: DoctorSeverity;
  code: string;
  message: string;
}

export interface DoctorProjectResult {
  projectPath: string;
  issues: DoctorIssue[];
  ok: boolean;
}

const LOCKFILES = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lock", "bun.lockb"];

export async function doctorNpmProject(options: {
  storePath: string;
  projectPath: string;
}): Promise<DoctorProjectResult> {
  const projectPath = resolveUserPath(options.projectPath);
  const issues: DoctorIssue[] = [];
  const lockfilePath = path.join(projectPath, "package-lock.json");
  const nodeModulesPath = path.join(projectPath, "node_modules");

  await checkLockfiles(projectPath, issues);

  if (!(await fs.pathExists(lockfilePath))) {
    issues.push({
      severity: "error",
      code: "missing-package-lock",
      message: "package-lock.json not found",
    });

    return buildResult(projectPath, issues);
  }

  const lockfile = await parseNpmPackageLockFile(lockfilePath);
  const lockfileHash = await hashFile(lockfilePath);
  if (!lockfileHash) {
    issues.push({
      severity: "error",
      code: "unreadable-lockfile",
      message: "package-lock.json could not be read",
    });
  }

  await checkNodeModules(nodeModulesPath, issues);
  await checkStorePackages(options.storePath, lockfile.packages, issues);
  await checkBinLinks(nodeModulesPath, lockfile.packages, issues);

  return buildResult(projectPath, issues);
}

async function checkLockfiles(projectPath: string, issues: DoctorIssue[]): Promise<void> {
  const presentLockfiles = (
    await Promise.all(
      LOCKFILES.map(async (file) => ((await fs.pathExists(path.join(projectPath, file))) ? file : null)),
    )
  ).filter((file) => file !== null);

  if (presentLockfiles.length > 1) {
    issues.push({
      severity: "warning",
      code: "multiple-lockfiles",
      message: `multiple lockfiles found: ${presentLockfiles.join(", ")}`,
    });
  }
}

async function checkNodeModules(nodeModulesPath: string, issues: DoctorIssue[]): Promise<void> {
  if (!(await fs.pathExists(nodeModulesPath))) {
    issues.push({
      severity: "warning",
      code: "missing-node-modules",
      message: "node_modules not found",
    });
    return;
  }

  const stat = await fs.lstat(nodeModulesPath);
  if (!stat.isSymbolicLink()) {
    issues.push({
      severity: "warning",
      code: "node-modules-not-virtual",
      message: "node_modules exists but is not a symlink managed by NodeValt",
    });
    return;
  }

  let realNodeModulesPath: string;
  try {
    realNodeModulesPath = await fs.realpath(nodeModulesPath);
  } catch {
    issues.push({
      severity: "error",
      code: "broken-node-modules-symlink",
      message: "node_modules symlink target is missing",
    });
    return;
  }

  await collectBrokenSymlinks(realNodeModulesPath, issues);
}

async function checkStorePackages(
  storePath: string,
  packages: Array<{ name: string; version: string; integrity: string | null; resolved: string | null }>,
  issues: DoctorIssue[],
): Promise<void> {
  for (const pkg of packages) {
    if (!pkg.resolved || !pkg.integrity) {
      continue;
    }

    const packageStorePath = getPackageStorePath(storePath, pkg);
    if (!(await fs.pathExists(packageStorePath))) {
      issues.push({
        severity: "error",
        code: "missing-store-package",
        message: `package missing from store: ${pkg.name}@${pkg.version}`,
      });
    }
  }
}

async function checkBinLinks(
  nodeModulesPath: string,
  packages: Array<{ packagePath: string; bin: Record<string, string> }>,
  issues: DoctorIssue[],
): Promise<void> {
  const expectedBins = packages
    .filter((pkg) => isTopLevelPackagePath(pkg.packagePath))
    .flatMap((pkg) => Object.keys(pkg.bin));

  for (const binName of expectedBins) {
    const binPath = path.join(nodeModulesPath, ".bin", binName);
    if (!(await fs.pathExists(binPath))) {
      issues.push({
        severity: "warning",
        code: "missing-bin-link",
        message: `.bin link missing: ${binName}`,
      });
    }
  }
}

async function collectBrokenSymlinks(currentPath: string, issues: DoctorIssue[]): Promise<void> {
  const stat = await fs.lstat(currentPath);

  if (stat.isSymbolicLink()) {
    const targetPath = await fs.readlink(currentPath);
    const absoluteTargetPath = path.isAbsolute(targetPath) ? targetPath : path.resolve(path.dirname(currentPath), targetPath);
    if (!(await fs.pathExists(absoluteTargetPath))) {
      issues.push({
        severity: "error",
        code: "broken-symlink",
        message: `broken symlink: ${currentPath}`,
      });
    }
    return;
  }

  if (!stat.isDirectory()) {
    return;
  }

  const entries = await fs.readdir(currentPath);
  for (const entry of entries) {
    await collectBrokenSymlinks(path.join(currentPath, entry), issues);
  }
}

function isTopLevelPackagePath(packagePath: string): boolean {
  if (!packagePath.startsWith("node_modules/")) {
    return false;
  }

  return !packagePath.slice("node_modules/".length).includes("/node_modules/");
}

function buildResult(projectPath: string, issues: DoctorIssue[]): DoctorProjectResult {
  return {
    projectPath,
    issues,
    ok: !issues.some((issue) => issue.severity === "error"),
  };
}
