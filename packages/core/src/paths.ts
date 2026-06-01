import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";

export const STORE_DIR_NAME = ".nodevalt-global-shell";

export const DEFAULT_IGNORED_DIRS = [
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  ".cache",
  ".turbo",
  ".vercel",
  "out",
];

export function expandHome(inputPath: string): string {
  if (inputPath === "~") {
    return os.homedir();
  }

  if (inputPath.startsWith("~/")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }

  return inputPath;
}

export function resolveUserPath(inputPath: string, cwd = process.cwd()): string {
  const expanded = expandHome(inputPath);
  return path.resolve(cwd, expanded);
}

export function getDefaultStorePath(): string {
  return path.join(os.homedir(), STORE_DIR_NAME);
}

export function getStorePaths(storePath: string) {
  return {
    root: storePath,
    content: path.join(storePath, "content"),
    packages: path.join(storePath, "content", "packages"),
    instances: path.join(storePath, "instances"),
    projects: path.join(storePath, "projects"),
    metadata: path.join(storePath, "metadata"),
    logs: path.join(storePath, "logs"),
    tmp: path.join(storePath, "tmp"),
    configFile: path.join(storePath, "metadata", "config.json"),
    databaseFile: path.join(storePath, "metadata", "nodevalt.json"),
  };
}

export async function ensureStoreLayout(storePath: string): Promise<void> {
  const paths = getStorePaths(storePath);
  await Promise.all([
    fs.ensureDir(paths.packages),
    fs.ensureDir(paths.instances),
    fs.ensureDir(paths.projects),
    fs.ensureDir(paths.metadata),
    fs.ensureDir(paths.logs),
    fs.ensureDir(paths.tmp),
  ]);
}

export function toDisplayPath(inputPath: string): string {
  const home = os.homedir();
  if (inputPath === home) {
    return "~";
  }

  if (inputPath.startsWith(`${home}${path.sep}`)) {
    return `~/${path.relative(home, inputPath)}`;
  }

  return inputPath;
}

export function hashString(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function hashFile(filePath: string): Promise<string | null> {
  try {
    const buffer = await fs.readFile(filePath);
    return crypto.createHash("sha256").update(buffer).digest("hex");
  } catch {
    return null;
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}
