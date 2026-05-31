import path from "node:path";
import { promises as nodeFs } from "node:fs";
import fs from "fs-extra";
import type Database from "better-sqlite3";
import type { ParsedNpmPackage } from "../../lockfile-parser/src/types";
import { upsertPackage } from "../../database/src/packages";
import { fetchPackageToStore } from "./package-fetcher";
import { getPackageContentId, getPackageStorePath, type StorePackageRef } from "./package-paths";

const LOCK_STALE_MS = 60 * 1000;
const LOCK_WAIT_MS = 100;

export interface EnsurePackageResult {
  id: string;
  name: string;
  version: string;
  storePath: string;
  status: "reused" | "downloaded" | "skipped";
}

export async function ensureNpmPackageInStore(options: {
  db: Database.Database;
  storePath: string;
  pkg: ParsedNpmPackage;
}): Promise<EnsurePackageResult> {
  const ref = toStorePackageRef(options.pkg);
  const id = getPackageContentId(ref);
  const destinationPath = getPackageStorePath(options.storePath, ref);

  if (!ref.resolved || !ref.integrity) {
    return {
      id,
      name: ref.name,
      version: ref.version,
      storePath: destinationPath,
      status: "skipped",
    };
  }

  const resolved = ref.resolved;
  const integrity = ref.integrity;
  const existed = await fs.pathExists(destinationPath);
  if (!existed) {
    await withFileLock(`${destinationPath}.lock`, async () => {
      if (await fs.pathExists(destinationPath)) {
        return;
      }

      await fetchPackageToStore({
        storePath: options.storePath,
        resolved,
        integrity,
        destinationPath,
      });
    });
  }

  upsertPackage(options.db, {
    id,
    name: ref.name,
    version: ref.version,
    integrity: ref.integrity,
    resolved: ref.resolved,
    storePath: destinationPath,
  });

  return {
    id,
    name: ref.name,
    version: ref.version,
    storePath: destinationPath,
    status: existed ? "reused" : "downloaded",
  };
}

function toStorePackageRef(pkg: ParsedNpmPackage): StorePackageRef {
  return {
    name: pkg.name,
    version: pkg.version,
    integrity: pkg.integrity,
    resolved: pkg.resolved,
  };
}

async function withFileLock<T>(lockPath: string, action: () => Promise<T>): Promise<T> {
  await fs.ensureDir(path.dirname(lockPath));

  const lockHandle = await acquireFileLock(lockPath);
  try {
    return await action();
  } finally {
    await lockHandle.close();
    await fs.remove(lockPath);
  }
}

async function acquireFileLock(lockPath: string) {
  while (true) {
    try {
      return await nodeFs.open(lockPath, "wx");
    } catch (error) {
      if (!isNodeError(error) || error.code !== "EEXIST") {
        throw error;
      }

      if (await removeStaleLock(lockPath)) {
        continue;
      }

      await sleep(LOCK_WAIT_MS);
    }
  }
}

async function removeStaleLock(lockPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(lockPath);
    if (Date.now() - stat.mtimeMs <= LOCK_STALE_MS) {
      return false;
    }

    await fs.remove(lockPath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return true;
    }

    throw error;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
