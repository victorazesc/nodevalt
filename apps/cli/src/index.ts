#!/usr/bin/env node
import { cac } from "cac";
import { addWatchPath, initStore, loadOrCreateConfig } from "../../../packages/core/src/config";
import { formatBytes, toDisplayPath } from "../../../packages/core/src/paths";
import { openNodeValtDatabase } from "../../../packages/database/src/db";
import { getPackageCount } from "../../../packages/database/src/packages";
import { getProjectStats, listProjects, upsertProject } from "../../../packages/database/src/projects";
import { scanProjects } from "../../../packages/scanner/src/scan";
import { populateStoreFromNpmProject } from "../../../packages/store/src/populate-store";

const cli = cac("nodevalt");

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

    console.log("NodeValt status");
    console.log("");
    console.log(`Store path: ${toDisplayPath(config.storePath)}`);
    console.log(`Managed projects: ${stats.count}`);
    console.log(`Tracked node_modules: ${formatBytes(stats.totalNodeModulesSizeBytes)}`);
    console.log(`Packages in store: ${packageCount}`);
    console.log("Package instances: 0");
    console.log("Estimated disk saved: 0 B");
    console.log("Daemon: not running");

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

cli.help();
cli.version("0.1.0");
cli.parse();
