import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initStore } from "../packages/core/src/config";
import { openNodeValtDatabase } from "../packages/database/src/db";
import { materializeNpmProjectVirtual } from "../packages/materializer/src/materialize-project";

const tmpRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tmpRoots.map((tmpRoot) => fs.remove(tmpRoot)));
  tmpRoots.length = 0;
});

describe("materializeNpmProjectVirtual", () => {
  it("creates a virtual node_modules tree with package symlinks", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "nodevalt-materializer-"));
    tmpRoots.push(tmpRoot);

    const projectPath = path.resolve("tests/fixtures/npm-basic");
    const { storePath } = await initStore(path.join(tmpRoot, "store"));
    const db = openNodeValtDatabase(storePath);

    try {
      const result = await materializeNpmProjectVirtual({
        db,
        storePath,
        projectPath,
      });

      const leftPadPath = path.join(result.virtualNodeModulesPath, "left-pad");
      const stat = await fs.lstat(leftPadPath);

      expect(result.packagesLinked).toBe(1);
      expect(stat.isSymbolicLink()).toBe(true);
    } finally {
      db.close();
    }
  });
});
