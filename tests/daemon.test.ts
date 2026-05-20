import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getProjectPathForEvent, isRelevantDaemonFile } from "../packages/daemon/src/watcher";

const tmpRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tmpRoots.map((tmpRoot) => fs.remove(tmpRoot)));
  tmpRoots.length = 0;
});

describe("daemon watcher helpers", () => {
  it("detects relevant package files", () => {
    expect(isRelevantDaemonFile("/tmp/app/package.json")).toBe(true);
    expect(isRelevantDaemonFile("/tmp/app/package-lock.json")).toBe(true);
    expect(isRelevantDaemonFile("/tmp/app/src/index.ts")).toBe(false);
  });

  it("resolves project path from lockfile event", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "nodevalt-daemon-"));
    tmpRoots.push(tmpRoot);

    const projectPath = path.join(tmpRoot, "project");
    await fs.ensureDir(projectPath);
    await fs.writeJson(path.join(projectPath, "package.json"), {
      name: "daemon-test",
    });

    await expect(getProjectPathForEvent(path.join(projectPath, "package-lock.json"))).resolves.toBe(projectPath);
  });
});
