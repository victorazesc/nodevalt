import path from "node:path";
import fs from "fs-extra";

export type DetectedPackageManager = "npm" | "yarn" | "pnpm" | "bun" | "unknown";

interface LockfileCandidate {
  file: string;
  manager: Exclude<DetectedPackageManager, "unknown">;
}

const LOCKFILES: LockfileCandidate[] = [
  { file: "package-lock.json", manager: "npm" },
  { file: "yarn.lock", manager: "yarn" },
  { file: "pnpm-lock.yaml", manager: "pnpm" },
  { file: "bun.lock", manager: "bun" },
  { file: "bun.lockb", manager: "bun" },
];

export interface PackageManagerDetection {
  packageManager: DetectedPackageManager;
  lockfilePath: string | null;
  warnings: string[];
}

export function packageManagerFromField(value: unknown): DetectedPackageManager {
  if (typeof value !== "string") {
    return "unknown";
  }

  const name = value.split("@")[0];
  if (name === "npm" || name === "yarn" || name === "pnpm" || name === "bun") {
    return name;
  }

  return "unknown";
}

export async function detectPackageManager(
  projectPath: string,
  packageManagerField: unknown,
): Promise<PackageManagerDetection> {
  const warnings: string[] = [];
  const presentLockfiles = (
    await Promise.all(
      LOCKFILES.map(async (candidate) => {
        const lockfilePath = path.join(projectPath, candidate.file);
        if (!(await fs.pathExists(lockfilePath))) {
          return null;
        }

        const stat = await fs.stat(lockfilePath);
        return {
          ...candidate,
          path: lockfilePath,
          mtimeMs: stat.mtimeMs,
        };
      }),
    )
  ).filter((candidate) => candidate !== null);

  const declaredPackageManager = packageManagerFromField(packageManagerField);

  if (presentLockfiles.length === 0) {
    return {
      packageManager: declaredPackageManager,
      lockfilePath: null,
      warnings,
    };
  }

  if (presentLockfiles.length === 1) {
    const [candidate] = presentLockfiles;
    return {
      packageManager: candidate.manager,
      lockfilePath: candidate.path,
      warnings,
    };
  }

  warnings.push("multiple lockfiles found");

  const declaredMatch = presentLockfiles.find((candidate) => candidate.manager === declaredPackageManager);
  if (declaredMatch) {
    return {
      packageManager: declaredMatch.manager,
      lockfilePath: declaredMatch.path,
      warnings,
    };
  }

  const newest = presentLockfiles.sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
  return {
    packageManager: newest.manager,
    lockfilePath: newest.path,
    warnings,
  };
}
