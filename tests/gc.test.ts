import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initStore } from "../packages/core/src/config";
import { getStorePaths } from "../packages/core/src/paths";
import { openNodeValtDatabase } from "../packages/database/src/db";
import { getPackageCount, upsertPackage } from "../packages/database/src/packages";
import { collectGarbage } from "../packages/gc/src/garbage-collector";
import { writeNodeValtLinksManifest } from "../packages/materializer/src/nodevalt-manifest";

const tmpRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tmpRoots.map((tmpRoot) => fs.remove(tmpRoot)));
  tmpRoots.length = 0;
});

describe("collectGarbage", () => {
  it("removes unreferenced packages and keeps linked packages", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "nodevalt-gc-"));
    tmpRoots.push(tmpRoot);

    const { storePath } = await initStore(path.join(tmpRoot, "store"));
    const usedPackagePath = path.join(storePath, "content", "packages", "used", "versions", "1.0.0", "usedhash", "package");
    const unusedPackagePath = path.join(storePath, "content", "packages", "unused", "versions", "1.0.0", "unusedhash", "package");
    await fs.ensureDir(usedPackagePath);
    await fs.ensureDir(unusedPackagePath);
    await fs.writeFile(path.join(usedPackagePath, "index.js"), "used");
    await fs.writeFile(path.join(unusedPackagePath, "index.js"), "unused");

    const virtualNodeModulesPath = path.join(getStorePaths(storePath).projects, "project", "node_modules");
    await fs.ensureDir(virtualNodeModulesPath);
    await fs.copy(usedPackagePath, path.join(virtualNodeModulesPath, "used"));
    await writeNodeValtLinksManifest(virtualNodeModulesPath, [usedPackagePath]);

    const db = openNodeValtDatabase(storePath);
    try {
      upsertPackage(db, {
        id: "used",
        name: "used",
        version: "1.0.0",
        integrity: "sha512-used",
        resolved: "https://registry.example/used.tgz",
        storePath: usedPackagePath,
      });
      upsertPackage(db, {
        id: "unused",
        name: "unused",
        version: "1.0.0",
        integrity: "sha512-unused",
        resolved: "https://registry.example/unused.tgz",
        storePath: unusedPackagePath,
      });

      const result = await collectGarbage({
        db,
        storePath,
      });

      expect(result.packagesRemoved).toBe(1);
      expect(getPackageCount(db)).toBe(1);
      expect(await fs.pathExists(usedPackagePath)).toBe(true);
      expect(await fs.pathExists(unusedPackagePath)).toBe(false);
    } finally {
      db.close();
    }
  });
});
