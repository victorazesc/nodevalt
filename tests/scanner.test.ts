import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_IGNORED_DIRS } from "../packages/core/src/paths";
import { scanProjects } from "../packages/scanner/src/scan";

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
      status: "ready",
    });
    expect(projects[0].lockfileHash).toEqual(expect.any(String));
  });
});
