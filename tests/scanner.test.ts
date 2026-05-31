import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_IGNORED_DIRS } from "../packages/core/src/paths";
import { scanProjects } from "../packages/scanner/src/scan";

const tmpRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tmpRoots.map((tmpRoot) => fs.remove(tmpRoot)));
  tmpRoots.length = 0;
});

describe("scanProjects", () => {
  it("finds npm projects with package-lock", async () => {
    const rootPath = path.resolve("tests/fixtures");
    const projects = await scanProjects(rootPath, {
      ignoredDirs: DEFAULT_IGNORED_DIRS,
    });

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      name: "npm-basic",
      packageManager: "npm",
      status: "missing-node-modules",
    });
    expect(projects[0].lockfileHash).toEqual(expect.any(String));
  });

  it("ignores NodeValt node_modules backups", async () => {
    const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "nodevalt-scan-"));
    tmpRoots.push(rootPath);

    await fs.ensureDir(path.join(rootPath, "app", "node_modules.nodevalt-backup-20260520-090000", "dep"));
    await fs.writeJson(path.join(rootPath, "app", "package.json"), {
      name: "app",
    });
    await fs.writeJson(path.join(rootPath, "app", "package-lock.json"), {
      lockfileVersion: 3,
      packages: {
        "": {
          name: "app",
          version: "1.0.0",
        },
      },
    });
    await fs.ensureDir(path.join(rootPath, "app", "node_modules"));
    await fs.writeJson(path.join(rootPath, "app", "node_modules.nodevalt-backup-20260520-090000", "dep", "package.json"), {
      name: "dep",
    });

    const projects = await scanProjects(rootPath, {
      ignoredDirs: DEFAULT_IGNORED_DIRS,
    });

    expect(projects.map((project) => project.name)).toEqual(["app"]);
  });
});
