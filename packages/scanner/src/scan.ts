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
  status: "ready" | "unsupported" | "missing-lockfile";
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
      .filter((entry) => !ignoredDirs.has(entry.name))
      .map((entry) => walk(path.join(currentPath, entry.name), ignoredDirs, projects)),
  );
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
    status: getStatus(detection.packageManager, detection.lockfilePath),
    warnings: detection.warnings,
  };
}

function getStatus(packageManager: DetectedPackageManager, lockfilePath: string | null): ScannedProject["status"] {
  if (packageManager !== "npm") {
    return "unsupported";
  }

  if (!lockfilePath) {
    return "missing-lockfile";
  }

  return "ready";
}
