import path from "node:path";
import { promises as nodeFs } from "node:fs";
import fs from "fs-extra";
import type Database from "better-sqlite3";
import type { ParsedNpmPackage } from "../../lockfile-parser/src/types";
import { upsertPackage } from "../../database/src/packages";
import { fetchPackageToStore } from "./package-fetcher";
import { getPackageContentId, getPackageStorePath, type StorePackageRef } from "./package-paths";

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

  const lockHandle = await nodeFs.open(lockPath, "wx");
  try {
    return await action();
  } finally {
    await lockHandle.close();
    await fs.remove(lockPath);
  }
}
