import fs from "fs-extra";
import {
  DEFAULT_IGNORED_DIRS,
  ensureStoreLayout,
  getDefaultStorePath,
  getStorePaths,
  resolveUserPath,
} from "./paths";

export type PackageManagerName = "npm" | "yarn" | "pnpm" | "bun";

export interface NodeValtConfig {
  version: string;
  watchPaths: string[];
  ignoredDirs: string[];
  storePath: string;
  mode: "daemon";
  packageManagers: Record<PackageManagerName, boolean>;
  autoMaterialize: boolean;
  backupBeforeReplace: boolean;
}

export function createDefaultConfig(storePath = getDefaultStorePath()): NodeValtConfig {
  return {
    version: "0.1.0",
    watchPaths: [],
    ignoredDirs: DEFAULT_IGNORED_DIRS,
    storePath,
    mode: "daemon",
    packageManagers: {
      npm: true,
      yarn: false,
      pnpm: false,
      bun: false,
    },
    autoMaterialize: false,
    backupBeforeReplace: true,
  };
}

export async function readConfig(storePath = getDefaultStorePath()): Promise<NodeValtConfig | null> {
  const configFile = getStorePaths(storePath).configFile;

  if (!(await fs.pathExists(configFile))) {
    return null;
  }

  const rawConfig = await fs.readJson(configFile);
  const defaultConfig = createDefaultConfig(storePath);

  return {
    ...defaultConfig,
    ...rawConfig,
    packageManagers: {
      ...defaultConfig.packageManagers,
      ...(rawConfig.packageManagers ?? {}),
    },
    ignoredDirs: rawConfig.ignoredDirs ?? defaultConfig.ignoredDirs,
    watchPaths: rawConfig.watchPaths ?? defaultConfig.watchPaths,
    storePath: rawConfig.storePath ?? storePath,
  };
}

export async function writeConfig(config: NodeValtConfig): Promise<void> {
  const configFile = getStorePaths(config.storePath).configFile;
  await fs.writeJson(configFile, config, { spaces: 2 });
}

export async function initStore(storePathInput?: string) {
  const storePath = storePathInput ? resolveUserPath(storePathInput) : getDefaultStorePath();
  await ensureStoreLayout(storePath);

  const existingConfig = await readConfig(storePath);
  const config = existingConfig ?? createDefaultConfig(storePath);
  config.storePath = storePath;

  await writeConfig(config);

  return {
    config,
    configFile: getStorePaths(storePath).configFile,
    storePath,
  };
}

export async function loadOrCreateConfig(storePathInput?: string): Promise<NodeValtConfig> {
  const storePath = storePathInput ? resolveUserPath(storePathInput) : getDefaultStorePath();
  await ensureStoreLayout(storePath);

  const config = (await readConfig(storePath)) ?? createDefaultConfig(storePath);
  await writeConfig(config);

  return config;
}

export async function addWatchPath(config: NodeValtConfig, watchPathInput: string): Promise<NodeValtConfig> {
  const watchPath = resolveUserPath(watchPathInput);
  if (!config.watchPaths.includes(watchPath)) {
    config.watchPaths = [...config.watchPaths, watchPath];
    await writeConfig(config);
  }

  return config;
}
