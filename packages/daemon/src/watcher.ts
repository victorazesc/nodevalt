import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import fs from "fs-extra";
import type Database from "better-sqlite3";
import type { NodeValtConfig } from "../../core/src/config";
import { hashString } from "../../core/src/paths";
import { insertEvent } from "../../database/src/events";
import { updateProjectStatus } from "../../database/src/projects";

const RELEVANT_FILES = new Set([
  "package.json",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
]);

export interface DaemonWatcher {
  watcher: FSWatcher;
  close: () => Promise<void>;
}

export async function startDaemonWatcher(options: {
  config: NodeValtConfig;
  db: Database.Database;
  onDirty?: (projectPath: string) => void;
}): Promise<DaemonWatcher> {
  const debounceTimers = new Map<string, NodeJS.Timeout>();
  const ignoredDirs = new Set(options.config.ignoredDirs);
  const watcher = chokidar.watch(options.config.watchPaths, {
    ignoreInitial: true,
    ignored: (filePath) => isIgnoredPath(filePath.toString(), ignoredDirs),
  });

  const handleEvent = async (eventType: string, filePath: string) => {
    if (!isRelevantDaemonFile(filePath)) {
      return;
    }

    const projectPath = await getProjectPathForEvent(filePath);
    if (!projectPath) {
      return;
    }

    const existingTimer = debounceTimers.get(projectPath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    debounceTimers.set(
      projectPath,
      setTimeout(() => {
        updateProjectStatus(options.db, {
          path: projectPath,
          status: "dirty",
        });
        insertEvent(options.db, {
          projectId: hashString(projectPath).slice(0, 16),
          type: "project-dirty",
          payload: {
            eventType,
            path: filePath,
            projectPath,
          },
          status: "processed",
        });
        options.onDirty?.(projectPath);
        debounceTimers.delete(projectPath);
      }, 1000),
    );
  };

  watcher.on("add", (filePath) => {
    void handleEvent("add", filePath);
  });
  watcher.on("change", (filePath) => {
    void handleEvent("change", filePath);
  });
  watcher.on("unlink", (filePath) => {
    void handleEvent("unlink", filePath);
  });

  return {
    watcher,
    close: async () => {
      for (const timer of debounceTimers.values()) {
        clearTimeout(timer);
      }
      debounceTimers.clear();
      await watcher.close();
    },
  };
}

export function isRelevantDaemonFile(filePath: string): boolean {
  return RELEVANT_FILES.has(path.basename(filePath));
}

export async function getProjectPathForEvent(filePath: string): Promise<string | null> {
  const basename = path.basename(filePath);
  if (basename === "package.json") {
    return path.dirname(filePath);
  }

  let currentPath = path.dirname(filePath);
  while (currentPath !== path.dirname(currentPath)) {
    if (await fs.pathExists(path.join(currentPath, "package.json"))) {
      return currentPath;
    }
    currentPath = path.dirname(currentPath);
  }

  return null;
}

function isIgnoredPath(filePath: string, ignoredDirs: Set<string>): boolean {
  return filePath.split(path.sep).some((segment) => ignoredDirs.has(segment));
}
