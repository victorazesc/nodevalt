import crypto from "node:crypto";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getPackageContentId, getPackageStorePath } from "../packages/store/src/package-paths";
import { verifyIntegrity } from "../packages/store/src/integrity";

describe("store package helpers", () => {
  it("builds stable package content paths", () => {
    const ref = {
      name: "@types/node",
      version: "20.0.0",
      integrity: "sha512-test",
      resolved: "https://registry.npmjs.org/@types/node/-/node-20.0.0.tgz",
    };

    expect(getPackageContentId(ref)).toHaveLength(64);
    expect(getPackageStorePath("/tmp/nodevalt", ref)).toContain(
      path.join("content", "packages", "@types__node", "versions", "20.0.0"),
    );
  });

  it("validates npm integrity strings", () => {
    const buffer = Buffer.from("nodevalt");
    const digest = crypto.createHash("sha512").update(buffer).digest("base64");

    expect(() => verifyIntegrity(buffer, `sha512-${digest}`)).not.toThrow();
    expect(() => verifyIntegrity(buffer, "sha512-invalid")).toThrow("Integrity check failed");
  });
});
