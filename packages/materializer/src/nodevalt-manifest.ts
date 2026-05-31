import path from "node:path";
import fs from "fs-extra";

export const NODEVALT_LINKS_MANIFEST = ".nodevalt-links.json";

export interface NodeValtLinksManifest {
  managedBy: "nodevalt";
  storePaths: string[];
}

export async function writeNodeValtLinksManifest(nodeModulesPath: string, storePaths: string[]): Promise<void> {
  await fs.writeJson(
    path.join(nodeModulesPath, NODEVALT_LINKS_MANIFEST),
    {
      managedBy: "nodevalt",
      storePaths: [...new Set(storePaths)].sort(),
    } satisfies NodeValtLinksManifest,
    {
      spaces: 2,
    },
  );
}

export async function readNodeValtLinksManifest(nodeModulesPath: string): Promise<NodeValtLinksManifest | null> {
  try {
    const value = (await fs.readJson(path.join(nodeModulesPath, NODEVALT_LINKS_MANIFEST))) as Partial<NodeValtLinksManifest>;
    if (value.managedBy !== "nodevalt" || !Array.isArray(value.storePaths)) {
      return null;
    }

    return {
      managedBy: "nodevalt",
      storePaths: value.storePaths.filter((item): item is string => typeof item === "string"),
    };
  } catch {
    return null;
  }
}
