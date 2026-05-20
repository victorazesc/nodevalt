import path from "node:path";
import { getStorePaths, hashString } from "../../core/src/paths";

export interface StorePackageRef {
  name: string;
  version: string;
  integrity: string | null;
  resolved: string | null;
}

export function getPackageContentId(ref: StorePackageRef): string {
  return hashString([ref.name, ref.version, ref.integrity ?? "", ref.resolved ?? ""].join("\0"));
}

export function getPackageStorePath(storePath: string, ref: StorePackageRef): string {
  const contentId = getPackageContentId(ref);
  return path.join(
    getStorePaths(storePath).packages,
    encodePackageName(ref.name),
    "versions",
    encodePathSegment(ref.version),
    contentId.slice(0, 32),
    "package",
  );
}

export function encodePackageName(name: string): string {
  return encodePathSegment(name.replace("/", "__"));
}

function encodePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._@+-]/g, "_");
}
