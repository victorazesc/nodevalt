#!/usr/bin/env node
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type Database from "better-sqlite3";
import { cac } from "cac";
import fs from "fs-extra";
import { addWatchPath, initStore, loadOrCreateConfig, type NodeValtConfig } from "../../../packages/core/src/config";
import { formatBytes, getStorePaths, toDisplayPath } from "../../../packages/core/src/paths";
import { openNodeValtDatabase } from "../../../packages/database/src/db";
import { getPackageCount } from "../../../packages/database/src/packages";
import { getProjectStats, listProjects, type ProjectRow, upsertProject } from "../../../packages/database/src/projects";
import { getDaemonWatchFiles, startDaemonWatcher, type DaemonWatcher } from "../../../packages/daemon/src/watcher";
import { doctorNpmProject } from "../../../packages/doctor/src/doctor-project";
import { collectGarbage } from "../../../packages/gc/src/garbage-collector";
import {
  type ActivatedMaterializeProjectResult,
  type MaterializeProjectResult,
  materializeNpmProject,
  materializeNpmProjectVirtual,
} from "../../../packages/materializer/src/materialize-project";
import { materializeInstalledNodeModules } from "../../../packages/materializer/src/materialize-installed-node-modules";
import { restoreProjectNodeModules } from "../../../packages/materializer/src/restore-project";
import { scanProjects, type ScannedProject } from "../../../packages/scanner/src/scan";
import { populateStoreFromNpmProject } from "../../../packages/store/src/populate-store";

const cli = cac("nodevalt");
const execFileAsync = promisify(execFile);
const LAUNCH_AGENT_LABEL = "com.nodevalt.daemon";

function run(action: () => Promise<void>): void {
  action().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exitCode = 1;
  });
}

cli
  .command("init", "Create NodeValt global store")
  .option("--store <path>", "Custom store path")
  .action((options: { store?: string }) =>
    run(async () => {
      const result = await initStore(options.store);
      const db = openNodeValtDatabase(result.storePath);
      db.close();

      console.log("NodeValt initialized");
      console.log(`Store path: ${toDisplayPath(result.storePath)}`);
      console.log(`Config: ${toDisplayPath(result.configFile)}`);
    }),
  );

cli
  .command("scan <path>", "Scan a directory for Node.js projects")
  .action((scanPath: string) =>
    run(async () => {
      const config = await loadOrCreateConfig();
      await addWatchPath(config, scanPath);

      const projects = await scanProjects(scanPath, {
        ignoredDirs: config.ignoredDirs,
      });

      const db = openNodeValtDatabase(config.storePath);
      for (const project of projects) {
        upsertProject(db, project);
      }
      db.close();

      console.log(`Found ${projects.length} Node.js projects.`);
      for (const project of projects) {
        const warnings = project.warnings.length > 0 ? ` (${project.warnings.join(", ")})` : "";
        console.log("");
        console.log(project.name ?? toDisplayPath(project.path));
        console.log(`  path: ${toDisplayPath(project.path)}`);
        console.log(`  package manager: ${project.packageManager}`);
        console.log(`  status: ${project.status}${warnings}`);
        console.log(`  lockfile: ${project.lockfilePath ? toDisplayPath(project.lockfilePath) : "none"}`);
        console.log(`  node_modules: ${formatBytes(project.nodeModulesSizeBytes)}`);
      }
    }),
  );

cli.command("status", "Show NodeValt status").action(() =>
  run(async () => {
    const config = await loadOrCreateConfig();
    const db = openNodeValtDatabase(config.storePath);
    const stats = getProjectStats(db);
    const packageCount = getPackageCount(db);
    const projects = listProjects(db);
    db.close();
    const daemonStatus = await getDaemonLaunchAgentStatus();

    console.log("NodeValt status");
    console.log("");
    console.log(`Store path: ${toDisplayPath(config.storePath)}`);
    console.log(`Managed projects: ${stats.count}`);
    console.log(`Tracked node_modules: ${formatBytes(stats.totalNodeModulesSizeBytes)}`);
    console.log(`Packages in store: ${packageCount}`);
    console.log("Package instances: 0");
    console.log("Estimated disk saved: 0 B");
    console.log(`Daemon: ${daemonStatus}`);

    if (projects.length > 0) {
      console.log("");
      console.log("Projects:");
      for (const project of projects.slice(0, 10)) {
        console.log(`- ${project.name ?? toDisplayPath(project.path)} [${project.status}]`);
      }
      if (projects.length > 10) {
        console.log(`- ... ${projects.length - 10} more`);
      }
    }
  }),
);

cli.command("store <action> <project>", "Manage the global package store").action((action: string, project: string) =>
  run(async () => {
    if (action !== "populate") {
      throw new Error(`Unsupported store action: ${action}`);
    }

    const config = await loadOrCreateConfig();
    const db = openNodeValtDatabase(config.storePath);

    try {
      const result = await populateStoreFromNpmProject({
        db,
        storePath: config.storePath,
        projectPath: project,
      });

      console.log("Store populated");
      console.log(`Packages resolved: ${result.resolved}`);
      console.log(`Packages downloaded: ${result.downloaded}`);
      console.log(`Packages reused: ${result.reused}`);
      console.log(`Packages skipped: ${result.skipped}`);
    } finally {
      db.close();
    }
  }),
);

cli
  .command("materialize <project>", "Create virtual node_modules for an npm project")
  .option("--virtual-only", "Do not replace local node_modules")
  .action((project: string, options: { virtualOnly?: boolean }) =>
    run(async () => {
      const config = await loadOrCreateConfig();
      const db = openNodeValtDatabase(config.storePath);

      try {
        const commandOptions = {
          db,
          storePath: config.storePath,
          projectPath: project,
        };
        let result: MaterializeProjectResult;
        let activation: ActivatedMaterializeProjectResult | null = null;
        if (options.virtualOnly) {
          result = await materializeNpmProjectVirtual(commandOptions);
        } else {
          activation = await materializeNpmProject(commandOptions);
          result = activation;
        }

        console.log("Virtual node_modules created");
        console.log(`Project: ${toDisplayPath(result.projectPath)}`);
        console.log(`Virtual path: ${toDisplayPath(result.virtualNodeModulesPath)}`);
        console.log(`Packages resolved: ${result.packagesResolved}`);
        console.log(`Packages downloaded: ${result.packagesDownloaded}`);
        console.log(`Packages reused: ${result.packagesReused}`);
        console.log(`Packages skipped: ${result.packagesSkipped}`);
        console.log(`Packages linked: ${result.packagesLinked}`);
        console.log(`Bins linked: ${result.binsLinked}`);
        if (activation) {
          console.log(`Local node_modules: ${toDisplayPath(activation.localNodeModulesPath)}`);
          console.log(`Backup: ${activation.backupPath ? toDisplayPath(activation.backupPath) : "none"}`);
        }
      } finally {
        db.close();
      }
    }),
  );

cli.command("restore <project>", "Restore latest node_modules backup").action((project: string) =>
  run(async () => {
    const config = await loadOrCreateConfig();
    const db = openNodeValtDatabase(config.storePath);

    try {
      const result = await restoreProjectNodeModules({
        db,
        projectPath: project,
      });

      console.log("Restored original node_modules from backup");
      console.log(`Project: ${toDisplayPath(result.projectPath)}`);
      console.log(`Restored from: ${toDisplayPath(result.restoredFrom)}`);
    } finally {
      db.close();
    }
  }),
);

cli.command("doctor <project>", "Check a NodeValt npm project").action((project: string) =>
  run(async () => {
    const config = await loadOrCreateConfig();
    const result = await doctorNpmProject({
      storePath: config.storePath,
      projectPath: project,
    });

    console.log(`Project: ${toDisplayPath(result.projectPath)}`);
    console.log(`Status: ${result.ok ? "ok" : "error"}`);

    if (result.issues.length > 0) {
      console.log("");
      for (const issue of result.issues) {
        console.log(`${issue.severity}: ${issue.code}: ${issue.message}`);
      }
    }

    if (!result.ok) {
      process.exitCode = 1;
    }
  }),
);

cli.command("gc", "Remove unreferenced packages from the global store").action(() =>
  run(async () => {
    const config = await loadOrCreateConfig();
    const db = openNodeValtDatabase(config.storePath);

    try {
      const result = await collectGarbage({
        db,
        storePath: config.storePath,
      });

      console.log(`Unused packages removed: ${result.packagesRemoved}`);
      console.log(`Disk freed: ${formatBytes(result.diskFreedBytes)}`);
    } finally {
      db.close();
    }
  }),
);

cli
  .command("daemon <action>", "Manage NodeValt daemon")
  .option("--path <path>", "Path to scan/watch")
  .option("--scan-interval <seconds>", "Periodic scan interval in seconds", { default: "60" })
  .option("--no-auto-materialize", "Scan/watch without replacing node_modules")
  .action(
    (
      action: string,
      options: {
        path?: string;
        scanInterval?: string;
        autoMaterialize?: boolean;
      },
    ) =>
      run(async () => {
        const config = await loadOrCreateConfig();
        if (action === "install") {
          await installDaemonLaunchAgent(config, options);
          return;
        }

        if (action === "uninstall") {
          await uninstallDaemonLaunchAgent();
          return;
        }

        if (action === "status") {
          await showDaemonLaunchAgentStatus();
          return;
        }

        if (action !== "start") {
          throw new Error(`Unsupported daemon action: ${action}`);
        }

        await ensureDaemonWatchPath(config, options.path);

        const db = openNodeValtDatabase(config.storePath);
        let daemon: DaemonWatcher | null = null;
        let runningCycle: Promise<void> | null = null;
        let stopRequested = false;
        let resolveStop: () => void;
        const stopPromise = new Promise<void>((resolve) => {
          resolveStop = resolve;
        });
        const stop = () => {
          stopRequested = true;
          resolveStop();
        };
        const scanIntervalMs = parseScanIntervalMs(options.scanInterval);
        const autoMaterialize = options.autoMaterialize !== false;

        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);

        const runCycle = (reason: string): Promise<void> => {
          if (runningCycle) {
            return runningCycle;
          }

          runningCycle = runDaemonCycle({
            config,
            db,
            daemon,
            reason,
            autoMaterialize,
            shouldStop: () => stopRequested,
          }).finally(() => {
            runningCycle = null;
          });

          return runningCycle;
        };

        await runCycle("initial");
        if (stopRequested) {
          db.close();
          console.log("NodeValt daemon stopped");
          return;
        }

        daemon = await startDaemonWatcher({
          config,
          db,
          onDirty: (projectPath) => {
            console.log(`Dirty: ${toDisplayPath(projectPath)}`);
            void runCycle("change");
          },
          onError: (error) => {
            console.error(`Watcher error: ${error.message}`);
          },
        });

        if (daemon.watchedProjectCount === 0) {
          console.log("No npm projects with package-lock.json found.");
          await daemon.close();
          db.close();
          return;
        }

        const interval = setInterval(() => {
          void runCycle("interval");
        }, scanIntervalMs);

        console.log("NodeValt daemon started");
        console.log(`Watching: ${config.watchPaths.map(toDisplayPath).join(", ")}`);
        console.log(`Tracked projects: ${daemon.watchedProjectCount}`);
        console.log(`Auto materialize: ${autoMaterialize ? "on" : "off"}`);
        console.log(`Scan interval: ${Math.round(scanIntervalMs / 1000)}s`);

        await stopPromise;

        clearInterval(interval);
        await runningCycle;
        await daemon.close();
        db.close();
        console.log("NodeValt daemon stopped");
      }),
  );

async function ensureDaemonWatchPath(config: NodeValtConfig, watchPathInput?: string): Promise<void> {
  if (watchPathInput) {
    await addWatchPath(config, watchPathInput);
    return;
  }

  if (config.watchPaths.length > 0) {
    return;
  }

  await addWatchPath(config, await getDefaultDaemonWatchPath());
}

async function getDefaultDaemonWatchPath(): Promise<string> {
  const projectsPath = path.join(os.homedir(), "projetos");
  if (await fs.pathExists(projectsPath)) {
    return projectsPath;
  }

  return process.cwd();
}

function parseScanIntervalMs(value?: string): number {
  const seconds = Number(value ?? "60");
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error("scan interval must be a positive number");
  }

  return seconds * 1000;
}

async function runDaemonCycle(options: {
  config: NodeValtConfig;
  db: Database.Database;
  daemon: DaemonWatcher | null;
  reason: string;
  autoMaterialize: boolean;
  shouldStop: () => boolean;
}): Promise<void> {
  const projects = await scanConfiguredWatchPaths(options.config, options.db);
  options.daemon?.watcher.add(getDaemonWatchFiles(projects.map((project) => project.path)));

  console.log(`[${options.reason}] scanned ${projects.length} projects`);

  if (!options.autoMaterialize || options.shouldStop()) {
    return;
  }

  const materialized = await materializePendingProjects(options.db, options.config.storePath, options.shouldStop);
  if (materialized > 0) {
    console.log(`[${options.reason}] materialized ${materialized} projects`);
  }
}

async function scanConfiguredWatchPaths(config: NodeValtConfig, db: Database.Database): Promise<ScannedProject[]> {
  const existingProjects = new Map(listProjects(db).map((project) => [project.path, project]));
  const scannedProjects = new Map<string, ScannedProject>();

  for (const watchPath of config.watchPaths) {
    const projects = await scanProjects(watchPath, {
      ignoredDirs: config.ignoredDirs,
    });
    for (const project of projects) {
      scannedProjects.set(project.path, project);
    }
  }

  for (const project of scannedProjects.values()) {
    upsertProject(db, {
      ...project,
      status: getNextProjectStatus(project, existingProjects.get(project.path)),
    });
  }

  return [...scannedProjects.values()];
}

function getNextProjectStatus(project: ScannedProject, existingProject?: ProjectRow): string {
  if (
    existingProject &&
    (existingProject.status === "materialized" || existingProject.status === "virtualized") &&
    existingProject.lockfile_hash === project.lockfileHash
  ) {
    return existingProject.status;
  }

  return project.status;
}

async function materializePendingProjects(
  db: Database.Database,
  storePath: string,
  shouldStop: () => boolean,
): Promise<number> {
  const projects = listProjects(db).filter((project) => {
    return (
      !isDaemonOwnProject(project) &&
      ["npm", "yarn"].includes(project.package_manager) &&
      project.lockfile_path &&
      ["ready", "dirty"].includes(project.status)
    );
  });

  let materialized = 0;
  for (const project of projects) {
    if (shouldStop()) {
      break;
    }

    try {
      console.log(`Materializing: ${project.name ?? toDisplayPath(project.path)}`);
      const result = await materializeInstalledNodeModules({
        db,
        storePath,
        projectPath: project.path,
      });
      console.log(
        `  linked: ${result.packagesLinked}, copied: ${result.packagesCopied}, reused: ${result.packagesReused}`,
      );
      materialized += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Materialize failed: ${project.name ?? toDisplayPath(project.path)}: ${message}`);
    }
  }

  return materialized;
}

function isDaemonOwnProject(project: ProjectRow): boolean {
  return project.name === "nodevalt" && path.resolve(project.path) === process.cwd();
}

async function installDaemonLaunchAgent(
  config: NodeValtConfig,
  options: {
    path?: string;
    scanInterval?: string;
    autoMaterialize?: boolean;
  },
): Promise<void> {
  await ensureDaemonWatchPath(config, options.path);

  const cliEntryPoint = path.join(process.cwd(), "dist", "cli", "index.js");
  if (!(await fs.pathExists(cliEntryPoint))) {
    throw new Error("Build the CLI before installing the daemon: npm run build");
  }

  const storePaths = getStorePaths(config.storePath);
  await fs.ensureDir(storePaths.logs);
  await fs.ensureDir(path.dirname(getLaunchAgentPath()));

  const programArguments = [
    process.execPath,
    cliEntryPoint,
    "daemon",
    "start",
    "--scan-interval",
    String(Math.round(parseScanIntervalMs(options.scanInterval) / 1000)),
  ];
  if (options.autoMaterialize === false) {
    programArguments.push("--no-auto-materialize");
  }

  const plist = createLaunchAgentPlist({
    programArguments,
    workingDirectory: process.cwd(),
    stdoutPath: path.join(storePaths.logs, "daemon.out.log"),
    stderrPath: path.join(storePaths.logs, "daemon.err.log"),
  });
  const plistPath = getLaunchAgentPath();

  await fs.writeFile(plistPath, plist);
  await launchctl(["bootout", getLaunchAgentDomain(), plistPath], true);
  await launchctl(["bootstrap", getLaunchAgentDomain(), plistPath]);
  await launchctl(["kickstart", "-k", `${getLaunchAgentDomain()}/${LAUNCH_AGENT_LABEL}`]);

  console.log("NodeValt daemon installed and started");
  console.log(`LaunchAgent: ${toDisplayPath(plistPath)}`);
  console.log(`Watching: ${config.watchPaths.map(toDisplayPath).join(", ")}`);
  console.log(`Logs: ${toDisplayPath(storePaths.logs)}`);
}

async function uninstallDaemonLaunchAgent(): Promise<void> {
  const plistPath = getLaunchAgentPath();

  await launchctl(["bootout", getLaunchAgentDomain(), plistPath], true);
  await fs.remove(plistPath);

  console.log("NodeValt daemon uninstalled");
}

async function showDaemonLaunchAgentStatus(): Promise<void> {
  console.log(`NodeValt daemon: ${await getDaemonLaunchAgentStatus()}`);
}

async function getDaemonLaunchAgentStatus(): Promise<string> {
  try {
    const { stdout } = await launchctl(["print", `${getLaunchAgentDomain()}/${LAUNCH_AGENT_LABEL}`]);
    const pid = stdout.match(/pid = (\d+)/)?.[1] ?? "not running";
    return `loaded (${pid})`;
  } catch {
    return "not loaded";
  }
}

function createLaunchAgentPlist(options: {
  programArguments: string[];
  workingDirectory: string;
  stdoutPath: string;
  stderrPath: string;
}): string {
  const args = options.programArguments.map((arg) => `    <string>${escapeXml(arg)}</string>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>WorkingDirectory</key>
  <string>${escapeXml(options.workingDirectory)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapeXml(options.stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(options.stderrPath)}</string>
</dict>
</plist>
`;
}

function getLaunchAgentPath(): string {
  return path.join(os.homedir(), "Library", "LaunchAgents", `${LAUNCH_AGENT_LABEL}.plist`);
}

function getLaunchAgentDomain(): string {
  const uid = process.getuid?.();
  if (uid === undefined) {
    throw new Error("LaunchAgent is only supported on Unix-like systems");
  }

  return `gui/${uid}`;
}

async function launchctl(args: string[], ignoreFailure = false): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execFileAsync("launchctl", args);
  } catch (error) {
    if (ignoreFailure) {
      return { stdout: "", stderr: "" };
    }

    throw error;
  }
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

cli.help();
cli.version("0.1.0");
cli.parse();
