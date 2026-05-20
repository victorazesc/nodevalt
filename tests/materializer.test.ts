import fs from "fs-extra";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { initStore } from "../packages/core/src/config";
import { openNodeValtDatabase } from "../packages/database/src/db";
import { createBinLinks } from "../packages/materializer/src/create-bin-links";
import {
  materializeNpmProject,
  materializeNpmProjectVirtual,
} from "../packages/materializer/src/materialize-project";
import { restoreProjectNodeModules } from "../packages/materializer/src/restore-project";

const tmpRoots: string[] = [];
const execFileAsync = promisify(execFile);

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

  it("restores the latest node_modules backup", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "nodevalt-materializer-"));
    tmpRoots.push(tmpRoot);

    const projectPath = path.join(tmpRoot, "project");
    await fs.copy(path.resolve("tests/fixtures/npm-basic"), projectPath);
    await fs.ensureDir(path.join(projectPath, "node_modules"));
    await fs.writeFile(path.join(projectPath, "node_modules", "local.txt"), "local");

    const { storePath } = await initStore(path.join(tmpRoot, "store"));
    const db = openNodeValtDatabase(storePath);

    try {
      await materializeNpmProject({
        db,
        storePath,
        projectPath,
      });

      const result = await restoreProjectNodeModules({
        db,
        projectPath,
      });

      const nodeModulesStat = await fs.lstat(path.join(projectPath, "node_modules"));

      expect(nodeModulesStat.isDirectory()).toBe(true);
      expect(nodeModulesStat.isSymbolicLink()).toBe(false);
      expect(await fs.readFile(path.join(projectPath, "node_modules", "local.txt"), "utf8")).toBe("local");
      expect(await fs.pathExists(result.restoredFrom)).toBe(false);
    } finally {
      db.close();
    }
  });

  it("creates .bin symlinks for top-level packages", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "nodevalt-materializer-"));
    tmpRoots.push(tmpRoot);

    const virtualNodeModulesPath = path.join(tmpRoot, "node_modules");
    await fs.ensureDir(path.join(virtualNodeModulesPath, "tool", "bin"));
    await fs.writeFile(path.join(virtualNodeModulesPath, "tool", "bin", "tool.js"), "#!/usr/bin/env node\n");

    const result = await createBinLinks({
      virtualNodeModulesPath,
      packages: [
        {
          packagePath: "node_modules/tool",
          name: "tool",
          version: "1.0.0",
          resolved: null,
          integrity: null,
          dependencies: {},
          devDependencies: {},
          optionalDependencies: {},
          peerDependencies: {},
          bin: {
            tool: "bin/tool.js",
          },
          dev: false,
          optional: false,
        },
      ],
    });

    const binPath = path.join(virtualNodeModulesPath, ".bin", "tool");

    expect(result).toHaveLength(1);
    expect((await fs.lstat(binPath)).isSymbolicLink()).toBe(true);
    expect(await fs.readlink(binPath)).toBe("../tool/bin/tool.js");
  });

  it("runs npm dev and build scripts after materialization", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "nodevalt-runtime-"));
    tmpRoots.push(tmpRoot);

    const projectPath = path.join(tmpRoot, "project");
    await fs.copy(path.resolve("tests/fixtures/npm-basic"), projectPath);

    const { storePath } = await initStore(path.join(tmpRoot, "store"));
    const db = openNodeValtDatabase(storePath);

    try {
      await materializeNpmProject({
        db,
        storePath,
        projectPath,
      });

      const dev = await execFileAsync("npm", ["run", "dev"], {
        cwd: projectPath,
      });
      const build = await execFileAsync("npm", ["run", "build"], {
        cwd: projectPath,
      });

      expect(dev.stdout).toContain("..dev");
      expect(build.stdout).toContain("..build");
    } finally {
      db.close();
    }
  });
});
