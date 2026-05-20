import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initStore } from "../packages/core/src/config";
import { openNodeValtDatabase } from "../packages/database/src/db";
import {
  materializeNpmProject,
  materializeNpmProjectVirtual,
} from "../packages/materializer/src/materialize-project";

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

  it("backs up local node_modules and replaces it with a symlink", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "nodevalt-materializer-"));
    tmpRoots.push(tmpRoot);

    const projectPath = path.join(tmpRoot, "project");
    await fs.copy(path.resolve("tests/fixtures/npm-basic"), projectPath);
    await fs.ensureDir(path.join(projectPath, "node_modules"));
    await fs.writeFile(path.join(projectPath, "node_modules", "local.txt"), "local");

    const { storePath } = await initStore(path.join(tmpRoot, "store"));
    const db = openNodeValtDatabase(storePath);

    try {
      const result = await materializeNpmProject({
        db,
        storePath,
        projectPath,
      });

      const nodeModulesStat = await fs.lstat(path.join(projectPath, "node_modules"));

      expect(nodeModulesStat.isSymbolicLink()).toBe(true);
      expect(result.backupPath).toEqual(expect.stringContaining("node_modules.nodevalt-backup-"));
      expect(await fs.pathExists(path.join(result.backupPath ?? "", "local.txt"))).toBe(true);
    } finally {
      db.close();
    }
  });
});
