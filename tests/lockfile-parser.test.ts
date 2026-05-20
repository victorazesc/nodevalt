import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseNpmPackageLock,
  parseNpmPackageLockFile,
} from "../packages/lockfile-parser/src/npm-parser";

describe("parseNpmPackageLockFile", () => {
  it("parses package-lock v3 packages", async () => {
    const lockfilePath = path.resolve("tests/fixtures/npm-basic/package-lock.json");
    const parsed = await parseNpmPackageLockFile(lockfilePath);

    expect(parsed.lockfileVersion).toBe(3);
    expect(parsed.root).toMatchObject({
      name: "npm-basic",
      version: "1.0.0",
      dependencies: {
        "left-pad": "1.3.0",
      },
    });
    expect(parsed.packages).toEqual([
      expect.objectContaining({
        packagePath: "node_modules/left-pad",
        name: "left-pad",
        version: "1.3.0",
        resolved: "https://registry.npmjs.org/left-pad/-/left-pad-1.3.0.tgz",
        integrity: expect.stringMatching(/^sha512-/),
      }),
    ]);
  });

  it("normalizes scoped names, peer dependencies and string bins", () => {
    const parsed = parseNpmPackageLock({
      name: "fixture",
      version: "1.0.0",
      lockfileVersion: 2,
      packages: {
        "": {
          name: "fixture",
          version: "1.0.0",
          dependencies: {
            "@scope/pkg": "2.0.0",
          },
          devDependencies: {
            tool: "1.0.0",
          },
        },
        "node_modules/@scope/pkg": {
          version: "2.0.0",
          resolved: "https://registry.npmjs.org/@scope/pkg/-/pkg-2.0.0.tgz",
          integrity: "sha512-test",
          peerDependencies: {
            react: "^18.0.0",
          },
          bin: {
            pkg: "bin/pkg.js",
          },
        },
        "node_modules/tool": {
          version: "1.0.0",
          bin: "cli.js",
          dev: true,
          optional: true,
        },
      },
    });

    expect(parsed.lockfileVersion).toBe(2);
    expect(parsed.packages).toEqual([
      expect.objectContaining({
        name: "@scope/pkg",
        peerDependencies: {
          react: "^18.0.0",
        },
        bin: {
          pkg: "bin/pkg.js",
        },
      }),
      expect.objectContaining({
        name: "tool",
        bin: {
          tool: "cli.js",
        },
        dev: true,
        optional: true,
      }),
    ]);
  });
});
