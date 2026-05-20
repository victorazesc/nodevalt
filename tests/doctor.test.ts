import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initStore } from "../packages/core/src/config";
import { openNodeValtDatabase } from "../packages/database/src/db";
import { doctorNpmProject } from "../packages/doctor/src/doctor-project";
import { materializeNpmProject } from "../packages/materializer/src/materialize-project";

const tmpRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tmpRoots.map((tmpRoot) => fs.remove(tmpRoot)));
  tmpRoots.length = 0;
});

describe("doctorNpmProject", () => {
  it("passes for a materialized npm project", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "nodevalt-doctor-"));
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

      const result = await doctorNpmProject({
        storePath,
        projectPath,
      });

      expect(result.ok).toBe(true);
      expect(result.issues).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("reports missing package-lock", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "nodevalt-doctor-"));
    tmpRoots.push(tmpRoot);

    const projectPath = path.join(tmpRoot, "project");
    await fs.ensureDir(projectPath);
    await fs.writeJson(path.join(projectPath, "package.json"), {
      name: "missing-lock",
    });

    const result = await doctorNpmProject({
      storePath: path.join(tmpRoot, "store"),
      projectPath,
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "missing-package-lock",
      }),
    );
  });
});
