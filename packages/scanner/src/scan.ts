import path from "node:path";
import type { Dirent } from "node:fs";
import fs from "fs-extra";
import {
  hashFile,
  hashString,
  resolveUserPath,
} from "../../core/src/paths";
import { detectPackageManager, type DetectedPackageManager } from "./package-manager";
import { getDirectorySizeBytes } from "./size";

export interface ScannedProject {
  id: string;
  path: string;
  name: string | null;
  packageManager: DetectedPackageManager;
  lockfilePath: string | null;
  lockfileHash: string | null;
  nodeModulesPath: string;
  nodeModulesSizeBytes: number;
  status: "ready" | "unsupported" | "missing-lockfile" | "missing-node-modules";
  warnings: string[];
}

interface PackageJson {
  name?: string;
  packageManager?: string;
}

export interface ScanOptions {
  ignoredDirs: string[];
}

export async function scanProjects(rootPathInput: string, options: ScanOptions): Promise<ScannedProject[]> {
  const rootPath = resolveUserPath(rootPathInput);
  const ignoredDirs = new Set(options.ignoredDirs);
  const projects: ScannedProject[] = [];

  await walk(rootPath, ignoredDirs, projects);

  return projects.sort((a, b) => a.path.localeCompare(b.path));
}

async function walk(
  currentPath: string,
  ignoredDirs: Set<string>,
  projects: ScannedProject[],
): Promise<void> {
  let entries: Dirent[];

  try {
    entries = await fs.readdir(currentPath, { withFileTypes: true });
  } catch {
    return;
  }

  const hasPackageJson = entries.some((entry) => entry.isFile() && entry.name === "package.json");
  if (hasPackageJson) {
    const project = await readProject(currentPath);
    if (project) {
      projects.push(project);
    }
  }

  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .filter((entry) => !isIgnoredDirectory(entry.name, ignoredDirs))
      .map((entry) => walk(path.join(currentPath, entry.name), ignoredDirs, projects)),
  );
}

function isIgnoredDirectory(name: string, ignoredDirs: Set<string>): boolean {
  return ignoredDirs.has(name) || name.startsWith("node_modules.nodevalt-backup-");
}

async function readProject(projectPath: string): Promise<ScannedProject | null> {
  const packageJsonPath = path.join(projectPath, "package.json");

  let packageJson: PackageJson;
  try {
    packageJson = (await fs.readJson(packageJsonPath)) as PackageJson;
  } catch {
    return null;
  }

  const detection = await detectPackageManager(projectPath, packageJson.packageManager);
  const lockfileHash = detection.lockfilePath ? await hashFile(detection.lockfilePath) : null;
  const nodeModulesPath = path.join(projectPath, "node_modules");
  const hasNodeModules = await hasRootNodeModules(nodeModulesPath);
  const nodeModulesSizeBytes = await getDirectorySizeBytes(nodeModulesPath);

  return {
    id: hashString(projectPath).slice(0, 16),
    path: projectPath,
    name: packageJson.name ?? null,
    packageManager: detection.packageManager,
    lockfilePath: detection.lockfilePath,
    lockfileHash,
    nodeModulesPath,
    nodeModulesSizeBytes,
    status: getStatus(detection.packageManager, detection.lockfilePath, hasNodeModules),
    warnings: detection.warnings,
  };
}

async function hasRootNodeModules(nodeModulesPath: string): Promise<boolean> {
  try {
    const stat = await fs.lstat(nodeModulesPath);
    return stat.isDirectory() || stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function getStatus(
  packageManager: DetectedPackageManager,
  lockfilePath: string | null,
  hasNodeModules: boolean,
): ScannedProject["status"] {
  if (packageManager !== "npm" && packageManager !== "yarn") {
    return "unsupported";
  }

  if (!lockfilePath) {
    return "missing-lockfile";
  }

  if (!hasNodeModules) {
    return "missing-node-modules";
  }

  return "ready";
}
