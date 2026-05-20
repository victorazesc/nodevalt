import fs from "fs-extra";
import type {
  BinMap,
  DependencyMap,
  ParsedNpmLockfile,
  ParsedNpmPackage,
  ParsedNpmRootPackage,
} from "./types";

type LockfileVersion = ParsedNpmLockfile["lockfileVersion"];

export async function parseNpmPackageLockFile(lockfilePath: string): Promise<ParsedNpmLockfile> {
  const rawLockfile = await fs.readJson(lockfilePath);
  return parseNpmPackageLock(rawLockfile);
}

export function parseNpmPackageLock(rawLockfile: unknown): ParsedNpmLockfile {
  if (!isRecord(rawLockfile)) {
    throw new Error("Invalid package-lock.json: expected object");
  }

  const lockfileVersion = parseLockfileVersion(rawLockfile.lockfileVersion);
  const packages = rawLockfile.packages;

  if (!isRecord(packages)) {
    throw new Error("Invalid package-lock.json: missing packages object");
  }

  const rootRaw = isRecord(packages[""]) ? packages[""] : {};
  const root = parseRootPackage(rawLockfile, rootRaw);
  const parsedPackages: ParsedNpmPackage[] = [];

  for (const [packagePath, packageRaw] of Object.entries(packages)) {
    if (packagePath === "" || !isRecord(packageRaw)) {
      continue;
    }

    const parsedPackage = parsePackage(packagePath, packageRaw);
    if (parsedPackage) {
      parsedPackages.push(parsedPackage);
    }
  }

  return {
    lockfileVersion,
    name: root.name,
    version: root.version,
    root,
    packages: parsedPackages.sort((a, b) => a.packagePath.localeCompare(b.packagePath)),
  };
}

function parseLockfileVersion(value: unknown): LockfileVersion {
  if (value === 2 || value === 3) {
    return value;
  }

  throw new Error("Unsupported package-lock.json version: expected v2 or v3");
}

function parseRootPackage(
  rawLockfile: Record<string, unknown>,
  rootRaw: Record<string, unknown>,
): ParsedNpmRootPackage {
  return {
    name: getString(rootRaw.name) ?? getString(rawLockfile.name),
    version: getString(rootRaw.version) ?? getString(rawLockfile.version),
    dependencies: asStringMap(rootRaw.dependencies),
    devDependencies: asStringMap(rootRaw.devDependencies),
    optionalDependencies: asStringMap(rootRaw.optionalDependencies),
    peerDependencies: asStringMap(rootRaw.peerDependencies),
  };
}

function parsePackage(packagePath: string, rawPackage: Record<string, unknown>): ParsedNpmPackage | null {
  const name = getPackageNameFromPath(packagePath) ?? getString(rawPackage.name);
  const version = getString(rawPackage.version);

  if (!name || !version) {
    return null;
  }

  return {
    packagePath,
    name,
    version,
    resolved: getString(rawPackage.resolved),
    integrity: getString(rawPackage.integrity),
    dependencies: asStringMap(rawPackage.dependencies),
    devDependencies: asStringMap(rawPackage.devDependencies),
    optionalDependencies: asStringMap(rawPackage.optionalDependencies),
    peerDependencies: asStringMap(rawPackage.peerDependencies),
    bin: normalizeBin(rawPackage.bin, name),
    dev: rawPackage.dev === true,
    optional: rawPackage.optional === true,
  };
}

function getPackageNameFromPath(packagePath: string): string | null {
  const segments = packagePath.split("/");
  const nodeModulesIndex = segments.lastIndexOf("node_modules");

  if (nodeModulesIndex === -1) {
    return null;
  }

  const firstNameSegment = segments[nodeModulesIndex + 1];
  if (!firstNameSegment) {
    return null;
  }

  if (firstNameSegment.startsWith("@")) {
    const scopedName = segments[nodeModulesIndex + 2];
    return scopedName ? `${firstNameSegment}/${scopedName}` : null;
  }

  return firstNameSegment;
}

function normalizeBin(value: unknown, packageName: string): BinMap {
  if (typeof value === "string") {
    return {
      [getDefaultBinName(packageName)]: value,
    };
  }

  return asStringMap(value);
}

function getDefaultBinName(packageName: string): string {
  const segments = packageName.split("/");
  return segments[segments.length - 1] ?? packageName;
}

function asStringMap(value: unknown): DependencyMap {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function getString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
