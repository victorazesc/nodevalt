#!/usr/bin/env node

// apps/cli/src/index.ts
import { execFile as execFile2 } from "child_process";
import os2 from "os";
import path22 from "path";
import { fileURLToPath } from "url";
import { promisify as promisify2 } from "util";
import { cac } from "cac";
import fs20 from "fs-extra";

// packages/core/src/config.ts
import fs2 from "fs-extra";

// packages/core/src/paths.ts
import crypto from "crypto";
import os from "os";
import path from "path";
import fs from "fs-extra";
var STORE_DIR_NAME = ".nodevalt-global-shell";
var DEFAULT_IGNORED_DIRS = [
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  ".cache",
  ".turbo",
  ".vercel",
  "out"
];
function expandHome(inputPath) {
  if (inputPath === "~") {
    return os.homedir();
  }
  if (inputPath.startsWith("~/")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}
function resolveUserPath(inputPath, cwd = process.cwd()) {
  const expanded = expandHome(inputPath);
  return path.resolve(cwd, expanded);
}
function getDefaultStorePath() {
  return path.join(os.homedir(), STORE_DIR_NAME);
}
function getStorePaths(storePath) {
  return {
    root: storePath,
    content: path.join(storePath, "content"),
    packages: path.join(storePath, "content", "packages"),
    instances: path.join(storePath, "instances"),
    projects: path.join(storePath, "projects"),
    metadata: path.join(storePath, "metadata"),
    logs: path.join(storePath, "logs"),
    tmp: path.join(storePath, "tmp"),
    configFile: path.join(storePath, "metadata", "config.json"),
    databaseFile: path.join(storePath, "metadata", "nodevalt.json")
  };
}
async function ensureStoreLayout(storePath) {
  const paths = getStorePaths(storePath);
  await Promise.all([
    fs.ensureDir(paths.packages),
    fs.ensureDir(paths.instances),
    fs.ensureDir(paths.projects),
    fs.ensureDir(paths.metadata),
    fs.ensureDir(paths.logs),
    fs.ensureDir(paths.tmp)
  ]);
}
function toDisplayPath(inputPath) {
  const home = os.homedir();
  if (inputPath === home) {
    return "~";
  }
  if (inputPath.startsWith(`${home}${path.sep}`)) {
    return `~/${path.relative(home, inputPath)}`;
  }
  return inputPath;
}
function hashString(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
async function hashFile(filePath) {
  try {
    const buffer = await fs.readFile(filePath);
    return crypto.createHash("sha256").update(buffer).digest("hex");
  } catch {
    return null;
  }
}
function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

// packages/core/src/config.ts
function createDefaultConfig(storePath = getDefaultStorePath()) {
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
      bun: false
    },
    autoMaterialize: false,
    backupBeforeReplace: true
  };
}
async function readConfig(storePath = getDefaultStorePath()) {
  const configFile = getStorePaths(storePath).configFile;
  if (!await fs2.pathExists(configFile)) {
    return null;
  }
  const rawConfig = await fs2.readJson(configFile);
  const defaultConfig = createDefaultConfig(storePath);
  return {
    ...defaultConfig,
    ...rawConfig,
    packageManagers: {
      ...defaultConfig.packageManagers,
      ...rawConfig.packageManagers ?? {}
    },
    ignoredDirs: rawConfig.ignoredDirs ?? defaultConfig.ignoredDirs,
    watchPaths: rawConfig.watchPaths ?? defaultConfig.watchPaths,
    storePath: rawConfig.storePath ?? storePath
  };
}
async function writeConfig(config) {
  const configFile = getStorePaths(config.storePath).configFile;
  await fs2.writeJson(configFile, config, { spaces: 2 });
}
async function initStore(storePathInput) {
  const storePath = storePathInput ? resolveUserPath(storePathInput) : getDefaultStorePath();
  await ensureStoreLayout(storePath);
  const existingConfig = await readConfig(storePath);
  const config = existingConfig ?? createDefaultConfig(storePath);
  config.storePath = storePath;
  await writeConfig(config);
  return {
    config,
    configFile: getStorePaths(storePath).configFile,
    storePath
  };
}
async function loadOrCreateConfig(storePathInput) {
  const storePath = storePathInput ? resolveUserPath(storePathInput) : getDefaultStorePath();
  await ensureStoreLayout(storePath);
  const config = await readConfig(storePath) ?? createDefaultConfig(storePath);
  await writeConfig(config);
  return config;
}
async function addWatchPath(config, watchPathInput) {
  const watchPath = resolveUserPath(watchPathInput);
  if (!config.watchPaths.includes(watchPath)) {
    config.watchPaths = [...config.watchPaths, watchPath];
    await writeConfig(config);
  }
  return config;
}

// packages/database/src/db.ts
import path2 from "path";
import fs3 from "fs-extra";
var NodeValtDatabase = class {
  constructor(filePath, data) {
    this.filePath = filePath;
    this.data = data;
  }
  filePath;
  data;
  save() {
    fs3.ensureDirSync(path2.dirname(this.filePath));
    fs3.writeJsonSync(this.filePath, this.data, { spaces: 2 });
  }
  close() {
    this.save();
  }
};
function openNodeValtDatabase(storePath) {
  const databaseFile = getStorePaths(storePath).databaseFile;
  fs3.ensureDirSync(path2.dirname(databaseFile));
  const data = fs3.pathExistsSync(databaseFile) ? normalizeDatabaseData(fs3.readJsonSync(databaseFile)) : createEmptyDatabaseData();
  return new NodeValtDatabase(databaseFile, data);
}
function createEmptyDatabaseData() {
  return {
    projects: [],
    packages: [],
    events: []
  };
}
function normalizeDatabaseData(value) {
  if (!value || typeof value !== "object") {
    return createEmptyDatabaseData();
  }
  const data = value;
  return {
    projects: Array.isArray(data.projects) ? data.projects : [],
    packages: Array.isArray(data.packages) ? data.packages : [],
    events: Array.isArray(data.events) ? data.events : []
  };
}

// packages/database/src/packages.ts
function upsertPackage(db, input) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const existing = db.data.packages.find((row) => row.id === input.id);
  if (existing) {
    Object.assign(existing, {
      name: input.name,
      version: input.version,
      integrity: input.integrity,
      resolved: input.resolved,
      store_path: input.storePath,
      updated_at: now
    });
  } else {
    db.data.packages.push({
      id: input.id,
      name: input.name,
      version: input.version,
      integrity: input.integrity,
      resolved: input.resolved,
      store_path: input.storePath,
      created_at: now,
      updated_at: now
    });
  }
  db.save();
}
function getPackageCount(db) {
  return db.data.packages.length;
}
function listPackages(db) {
  return [...db.data.packages].sort((a, b) => {
    const nameOrder = a.name.localeCompare(b.name);
    return nameOrder === 0 ? a.version.localeCompare(b.version) : nameOrder;
  });
}
function deletePackage(db, id) {
  db.data.packages = db.data.packages.filter((pkg) => pkg.id !== id);
  db.save();
}

// packages/database/src/projects.ts
function upsertProject(db, project) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const existing = db.data.projects.find((row) => row.path === project.path);
  if (existing) {
    Object.assign(existing, {
      name: project.name,
      package_manager: project.packageManager,
      lockfile_path: project.lockfilePath,
      lockfile_hash: project.lockfileHash,
      node_modules_path: project.nodeModulesPath,
      node_modules_size_bytes: project.nodeModulesSizeBytes,
      status: project.status,
      updated_at: now
    });
  } else {
    db.data.projects.push({
      id: project.id,
      path: project.path,
      name: project.name,
      package_manager: project.packageManager,
      lockfile_path: project.lockfilePath,
      lockfile_hash: project.lockfileHash,
      node_modules_path: project.nodeModulesPath,
      node_modules_size_bytes: project.nodeModulesSizeBytes,
      virtual_node_modules_path: null,
      status: project.status,
      created_at: now,
      updated_at: now
    });
  }
  db.save();
}
function listProjects(db) {
  return [...db.data.projects].sort((a, b) => a.path.localeCompare(b.path));
}
function getProjectStats(db) {
  return {
    count: db.data.projects.length,
    totalNodeModulesSizeBytes: db.data.projects.reduce((total, project) => {
      return total + project.node_modules_size_bytes;
    }, 0)
  };
}
function updateProjectMaterialization(db, input) {
  const project = db.data.projects.find((row) => row.path === input.path);
  if (!project) {
    return;
  }
  project.virtual_node_modules_path = input.virtualNodeModulesPath;
  project.status = input.status;
  project.updated_at = (/* @__PURE__ */ new Date()).toISOString();
  db.save();
}
function updateProjectStatus(db, input) {
  const project = db.data.projects.find((row) => row.path === input.path);
  if (!project) {
    return;
  }
  project.status = input.status;
  project.updated_at = (/* @__PURE__ */ new Date()).toISOString();
  db.save();
}

// packages/daemon/src/watcher.ts
import path3 from "path";
import chokidar from "chokidar";
import fs4 from "fs-extra";

// packages/database/src/events.ts
function insertEvent(db, input) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const id = hashString(`${input.type}\0${JSON.stringify(input.payload)}\0${now}`);
  db.data.events.push({
    id,
    project_id: input.projectId,
    type: input.type,
    payload: JSON.stringify(input.payload),
    status: input.status,
    created_at: now,
    processed_at: null
  });
  db.save();
  return id;
}

// packages/daemon/src/watcher.ts
var RELEVANT_FILES = /* @__PURE__ */ new Set([
  "package.json",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb"
]);
async function startDaemonWatcher(options) {
  const debounceTimers = /* @__PURE__ */ new Map();
  const ignoredDirs = new Set(options.config.ignoredDirs);
  const projects = listProjects(options.db);
  const watchFiles = getDaemonWatchFiles(projects.map((project) => project.path));
  const watcher = chokidar.watch(watchFiles, {
    ignoreInitial: true,
    ignored: (filePath) => isIgnoredPath(filePath.toString(), ignoredDirs)
  });
  const handleEvent = async (eventType, filePath) => {
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
          status: "dirty"
        });
        insertEvent(options.db, {
          projectId: hashString(projectPath).slice(0, 16),
          type: "project-dirty",
          payload: {
            eventType,
            path: filePath,
            projectPath
          },
          status: "processed"
        });
        options.onDirty?.(projectPath);
        debounceTimers.delete(projectPath);
      }, 1e3)
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
  watcher.on("error", (error) => {
    options.onError?.(error instanceof Error ? error : new Error(String(error)));
  });
  return {
    watcher,
    watchedProjectCount: projects.length,
    close: async () => {
      for (const timer of debounceTimers.values()) {
        clearTimeout(timer);
      }
      debounceTimers.clear();
      await watcher.close();
    }
  };
}
function getDaemonWatchFiles(projectPaths) {
  const watchFiles = /* @__PURE__ */ new Set();
  for (const projectPath of projectPaths) {
    for (const fileName of RELEVANT_FILES) {
      watchFiles.add(path3.join(projectPath, fileName));
    }
  }
  return [...watchFiles];
}
function isRelevantDaemonFile(filePath) {
  return RELEVANT_FILES.has(path3.basename(filePath));
}
async function getProjectPathForEvent(filePath) {
  const basename = path3.basename(filePath);
  if (basename === "package.json") {
    return path3.dirname(filePath);
  }
  let currentPath = path3.dirname(filePath);
  while (currentPath !== path3.dirname(currentPath)) {
    if (await fs4.pathExists(path3.join(currentPath, "package.json"))) {
      return currentPath;
    }
    currentPath = path3.dirname(currentPath);
  }
  return null;
}
function isIgnoredPath(filePath, ignoredDirs) {
  return filePath.split(path3.sep).some((segment) => ignoredDirs.has(segment));
}

// packages/doctor/src/doctor-project.ts
import path7 from "path";
import fs8 from "fs-extra";

// packages/lockfile-parser/src/npm-parser.ts
import fs5 from "fs-extra";
async function parseNpmPackageLockFile(lockfilePath) {
  const rawLockfile = await fs5.readJson(lockfilePath);
  return parseNpmPackageLock(rawLockfile);
}
function parseNpmPackageLock(rawLockfile) {
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
  const parsedPackages = [];
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
    packages: parsedPackages.sort((a, b) => a.packagePath.localeCompare(b.packagePath))
  };
}
function parseLockfileVersion(value) {
  if (value === 2 || value === 3) {
    return value;
  }
  throw new Error("Unsupported package-lock.json version: expected v2 or v3");
}
function parseRootPackage(rawLockfile, rootRaw) {
  return {
    name: getString(rootRaw.name) ?? getString(rawLockfile.name),
    version: getString(rootRaw.version) ?? getString(rawLockfile.version),
    dependencies: asStringMap(rootRaw.dependencies),
    devDependencies: asStringMap(rootRaw.devDependencies),
    optionalDependencies: asStringMap(rootRaw.optionalDependencies),
    peerDependencies: asStringMap(rootRaw.peerDependencies)
  };
}
function parsePackage(packagePath, rawPackage) {
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
    optional: rawPackage.optional === true
  };
}
function getPackageNameFromPath(packagePath) {
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
function normalizeBin(value, packageName) {
  if (typeof value === "string") {
    return {
      [getDefaultBinName(packageName)]: value
    };
  }
  return asStringMap(value);
}
function getDefaultBinName(packageName) {
  const segments = packageName.split("/");
  return segments[segments.length - 1] ?? packageName;
}
function asStringMap(value) {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry) => typeof entry[1] === "string")
  );
}
function getString(value) {
  return typeof value === "string" ? value : null;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// packages/materializer/src/activate-node-modules.ts
import path5 from "path";
import fs7 from "fs-extra";

// packages/materializer/src/link-package-tree.ts
import path4 from "path";
import fs6 from "fs-extra";
async function linkPackageTree(sourcePath, destinationPath) {
  const stat = await fs6.lstat(sourcePath);
  if (stat.isSymbolicLink()) {
    const targetPath = await fs6.readlink(sourcePath);
    await fs6.ensureDir(path4.dirname(destinationPath));
    await fs6.symlink(targetPath, destinationPath);
    return;
  }
  if (stat.isDirectory()) {
    await fs6.ensureDir(destinationPath);
    const entries = await fs6.readdir(sourcePath);
    await Promise.all(
      entries.map((entry) => linkPackageTree(path4.join(sourcePath, entry), path4.join(destinationPath, entry)))
    );
    return;
  }
  await fs6.ensureDir(path4.dirname(destinationPath));
  try {
    await fs6.link(sourcePath, destinationPath);
  } catch (error) {
    if (isCrossDeviceLinkError(error)) {
      await fs6.copyFile(sourcePath, destinationPath);
      return;
    }
    throw error;
  }
}
function isCrossDeviceLinkError(error) {
  return error instanceof Error && "code" in error && error.code === "EXDEV";
}

// packages/materializer/src/activate-node-modules.ts
var NODEVALT_MARKER_FILE = ".nodevalt.json";
async function activateVirtualNodeModules(options) {
  const localNodeModulesPath = path5.join(options.projectPath, "node_modules");
  const backupPath = await backupExistingNodeModules(localNodeModulesPath);
  await linkPackageTree(options.virtualNodeModulesPath, localNodeModulesPath);
  await writeNodeValtMarker(localNodeModulesPath, options.virtualNodeModulesPath);
  return {
    localNodeModulesPath,
    backupPath
  };
}
async function backupExistingNodeModules(localNodeModulesPath) {
  if (!await fs7.pathExists(localNodeModulesPath)) {
    return null;
  }
  const stat = await fs7.lstat(localNodeModulesPath);
  if (stat.isSymbolicLink()) {
    await fs7.remove(localNodeModulesPath);
    return null;
  }
  if (!stat.isDirectory()) {
    throw new Error("Cannot replace node_modules because it is not a directory or symlink");
  }
  if (await isNodeValtManagedNodeModules(localNodeModulesPath)) {
    await fs7.remove(localNodeModulesPath);
    return null;
  }
  const backupPath = `${localNodeModulesPath}.nodevalt-backup-${formatBackupTimestamp(/* @__PURE__ */ new Date())}`;
  await fs7.move(localNodeModulesPath, backupPath, {
    overwrite: false
  });
  return backupPath;
}
function formatBackupTimestamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}
async function isNodeValtManagedNodeModules(nodeModulesPath) {
  return fs7.pathExists(path5.join(nodeModulesPath, NODEVALT_MARKER_FILE));
}
async function writeNodeValtMarker(nodeModulesPath, virtualNodeModulesPath) {
  await fs7.writeJson(
    path5.join(nodeModulesPath, NODEVALT_MARKER_FILE),
    {
      managedBy: "nodevalt",
      strategy: "hardlink-tree",
      virtualNodeModulesPath,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    },
    {
      spaces: 2
    }
  );
}

// packages/store/src/package-paths.ts
import path6 from "path";
function getPackageContentId(ref) {
  return hashString([ref.name, ref.version, ref.integrity ?? "", ref.resolved ?? ""].join("\0"));
}
function getPackageStorePath(storePath, ref) {
  const contentId = getPackageContentId(ref);
  return path6.join(
    getStorePaths(storePath).packages,
    encodePackageName(ref.name),
    "versions",
    encodePathSegment(ref.version),
    contentId.slice(0, 32),
    "package"
  );
}
function encodePackageName(name) {
  return encodePathSegment(name.replace("/", "__"));
}
function encodePathSegment(value) {
  return value.replace(/[^a-zA-Z0-9._@+-]/g, "_");
}

// packages/doctor/src/doctor-project.ts
var LOCKFILES = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lock", "bun.lockb"];
async function doctorNpmProject(options) {
  const projectPath = resolveUserPath(options.projectPath);
  const issues = [];
  const lockfilePath = path7.join(projectPath, "package-lock.json");
  const nodeModulesPath = path7.join(projectPath, "node_modules");
  await checkLockfiles(projectPath, issues);
  if (!await fs8.pathExists(lockfilePath)) {
    issues.push({
      severity: "error",
      code: "missing-package-lock",
      message: "package-lock.json not found"
    });
    return buildResult(projectPath, issues);
  }
  const lockfile = await parseNpmPackageLockFile(lockfilePath);
  const lockfileHash = await hashFile(lockfilePath);
  if (!lockfileHash) {
    issues.push({
      severity: "error",
      code: "unreadable-lockfile",
      message: "package-lock.json could not be read"
    });
  }
  await checkNodeModules(nodeModulesPath, issues);
  await checkStorePackages(options.storePath, lockfile.packages, issues);
  await checkBinLinks(nodeModulesPath, lockfile.packages, issues);
  return buildResult(projectPath, issues);
}
async function checkLockfiles(projectPath, issues) {
  const presentLockfiles = (await Promise.all(
    LOCKFILES.map(async (file) => await fs8.pathExists(path7.join(projectPath, file)) ? file : null)
  )).filter((file) => file !== null);
  if (presentLockfiles.length > 1) {
    issues.push({
      severity: "warning",
      code: "multiple-lockfiles",
      message: `multiple lockfiles found: ${presentLockfiles.join(", ")}`
    });
  }
}
async function checkNodeModules(nodeModulesPath, issues) {
  if (!await fs8.pathExists(nodeModulesPath)) {
    issues.push({
      severity: "warning",
      code: "missing-node-modules",
      message: "node_modules not found"
    });
    return;
  }
  const stat = await fs8.lstat(nodeModulesPath);
  if (!stat.isSymbolicLink()) {
    if (!(stat.isDirectory() && await isNodeValtManagedNodeModules(nodeModulesPath))) {
      issues.push({
        severity: "warning",
        code: "node-modules-not-managed",
        message: "node_modules exists but is not managed by NodeValt"
      });
      return;
    }
    await collectBrokenSymlinks(nodeModulesPath, issues);
    return;
  }
  let realNodeModulesPath;
  try {
    realNodeModulesPath = await fs8.realpath(nodeModulesPath);
  } catch {
    issues.push({
      severity: "error",
      code: "broken-node-modules-symlink",
      message: "node_modules symlink target is missing"
    });
    return;
  }
  await collectBrokenSymlinks(realNodeModulesPath, issues);
}
async function checkStorePackages(storePath, packages, issues) {
  for (const pkg of packages) {
    if (!pkg.resolved || !pkg.integrity) {
      continue;
    }
    const packageStorePath = getPackageStorePath(storePath, pkg);
    if (!await fs8.pathExists(packageStorePath)) {
      issues.push({
        severity: "error",
        code: "missing-store-package",
        message: `package missing from store: ${pkg.name}@${pkg.version}`
      });
    }
  }
}
async function checkBinLinks(nodeModulesPath, packages, issues) {
  const expectedBins = packages.filter((pkg) => isTopLevelPackagePath(pkg.packagePath)).flatMap((pkg) => Object.keys(pkg.bin));
  for (const binName of expectedBins) {
    const binPath = path7.join(nodeModulesPath, ".bin", binName);
    if (!await fs8.pathExists(binPath)) {
      issues.push({
        severity: "warning",
        code: "missing-bin-link",
        message: `.bin link missing: ${binName}`
      });
    }
  }
}
async function collectBrokenSymlinks(currentPath, issues) {
  const stat = await fs8.lstat(currentPath);
  if (stat.isSymbolicLink()) {
    const targetPath = await fs8.readlink(currentPath);
    const absoluteTargetPath = path7.isAbsolute(targetPath) ? targetPath : path7.resolve(path7.dirname(currentPath), targetPath);
    if (!await fs8.pathExists(absoluteTargetPath)) {
      issues.push({
        severity: "error",
        code: "broken-symlink",
        message: `broken symlink: ${currentPath}`
      });
    }
    return;
  }
  if (!stat.isDirectory()) {
    return;
  }
  const entries = await fs8.readdir(currentPath);
  for (const entry of entries) {
    await collectBrokenSymlinks(path7.join(currentPath, entry), issues);
  }
}
function isTopLevelPackagePath(packagePath) {
  if (!packagePath.startsWith("node_modules/")) {
    return false;
  }
  return !packagePath.slice("node_modules/".length).includes("/node_modules/");
}
function buildResult(projectPath, issues) {
  return {
    projectPath,
    issues,
    ok: !issues.some((issue) => issue.severity === "error")
  };
}

// packages/gc/src/garbage-collector.ts
import path10 from "path";
import fs11 from "fs-extra";

// packages/materializer/src/nodevalt-manifest.ts
import path8 from "path";
import fs9 from "fs-extra";
var NODEVALT_LINKS_MANIFEST = ".nodevalt-links.json";
async function writeNodeValtLinksManifest(nodeModulesPath, storePaths) {
  await fs9.writeJson(
    path8.join(nodeModulesPath, NODEVALT_LINKS_MANIFEST),
    {
      managedBy: "nodevalt",
      storePaths: [...new Set(storePaths)].sort()
    },
    {
      spaces: 2
    }
  );
}
async function readNodeValtLinksManifest(nodeModulesPath) {
  try {
    const value = await fs9.readJson(path8.join(nodeModulesPath, NODEVALT_LINKS_MANIFEST));
    if (value.managedBy !== "nodevalt" || !Array.isArray(value.storePaths)) {
      return null;
    }
    return {
      managedBy: "nodevalt",
      storePaths: value.storePaths.filter((item) => typeof item === "string")
    };
  } catch {
    return null;
  }
}

// packages/scanner/src/size.ts
import path9 from "path";
import fs10 from "fs-extra";
async function getDirectorySizeBytes(targetPath) {
  try {
    const stat = await fs10.lstat(targetPath);
    if (stat.isSymbolicLink()) {
      return stat.size;
    }
    if (!stat.isDirectory()) {
      return stat.size;
    }
    const entries = await fs10.readdir(targetPath, { withFileTypes: true });
    const sizes = await Promise.all(
      entries.map((entry) => getDirectorySizeBytes(path9.join(targetPath, entry.name)))
    );
    return sizes.reduce((total, size) => total + size, 0);
  } catch {
    return 0;
  }
}

// packages/gc/src/garbage-collector.ts
async function collectGarbage(options) {
  const referencedStorePaths = await collectReferencedStorePaths(options.storePath);
  const packages = listPackages(options.db);
  let packagesRemoved = 0;
  let diskFreedBytes = 0;
  for (const pkg of packages) {
    const normalizedStorePath = await normalizeExistingPath(pkg.store_path);
    if (referencedStorePaths.has(normalizedStorePath)) {
      continue;
    }
    const packageRootPath = path10.dirname(normalizedStorePath);
    diskFreedBytes += await getDirectorySizeBytes(packageRootPath);
    await fs11.remove(packageRootPath);
    deletePackage(options.db, pkg.id);
    packagesRemoved += 1;
  }
  return {
    packagesRemoved,
    diskFreedBytes
  };
}
async function collectReferencedStorePaths(storePath) {
  const referencedStorePaths = /* @__PURE__ */ new Set();
  const projectsPath = getStorePaths(storePath).projects;
  if (!await fs11.pathExists(projectsPath)) {
    return referencedStorePaths;
  }
  await walkReferences(projectsPath, referencedStorePaths);
  return referencedStorePaths;
}
async function normalizeExistingPath(inputPath) {
  try {
    return await fs11.realpath(inputPath);
  } catch {
    return path10.resolve(inputPath);
  }
}
async function walkReferences(currentPath, referencedStorePaths) {
  let stat;
  try {
    stat = await fs11.lstat(currentPath);
  } catch {
    return;
  }
  if (stat.isSymbolicLink()) {
    try {
      referencedStorePaths.add(await fs11.realpath(currentPath));
    } catch {
      return;
    }
    return;
  }
  if (!stat.isDirectory()) {
    return;
  }
  const manifest = await readNodeValtLinksManifest(currentPath);
  if (manifest) {
    for (const storePath of manifest.storePaths) {
      referencedStorePaths.add(await normalizeExistingPath(storePath));
    }
  }
  const entries = await fs11.readdir(currentPath);
  await Promise.all(entries.map((entry) => walkReferences(path10.join(currentPath, entry), referencedStorePaths)));
}

// packages/materializer/src/materialize-project.ts
import path16 from "path";

// packages/store/src/global-store.ts
import path12 from "path";
import { promises as nodeFs } from "fs";
import fs13 from "fs-extra";

// packages/store/src/package-fetcher.ts
import { execFile } from "child_process";
import { promisify } from "util";
import path11 from "path";
import fs12 from "fs-extra";

// packages/store/src/integrity.ts
import crypto2 from "crypto";
var ALGORITHM_PRIORITY = ["sha512", "sha384", "sha256", "sha1"];
function verifyIntegrity(buffer, integrity) {
  const entry = pickIntegrityEntry(integrity);
  if (!entry) {
    throw new Error("Unsupported integrity format");
  }
  const actual = crypto2.createHash(entry.algorithm).update(buffer).digest("base64");
  const expected = entry.digest;
  if (!safeEqualBase64(actual, expected)) {
    throw new Error(`Integrity check failed for ${entry.algorithm}`);
  }
}
function pickIntegrityEntry(integrity) {
  const entries = integrity.split(/\s+/).map((value) => value.trim()).filter(Boolean).map(parseIntegrityEntry).filter((entry) => entry !== null);
  return entries.sort(
    (a, b) => ALGORITHM_PRIORITY.indexOf(a.algorithm) - ALGORITHM_PRIORITY.indexOf(b.algorithm)
  )[0] ?? null;
}
function parseIntegrityEntry(value) {
  const [algorithm, digestWithOptions] = value.split("-", 2);
  const digest = digestWithOptions?.split("?")[0];
  if (!isSupportedAlgorithm(algorithm) || !digest) {
    return null;
  }
  return {
    algorithm,
    digest
  };
}
function isSupportedAlgorithm(value) {
  return ALGORITHM_PRIORITY.includes(value);
}
function safeEqualBase64(actual, expected) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && crypto2.timingSafeEqual(actualBuffer, expectedBuffer);
}

// packages/store/src/package-fetcher.ts
var execFileAsync = promisify(execFile);
async function fetchPackageToStore(options) {
  const storePaths = getStorePaths(options.storePath);
  const tmpRoot = await fs12.mkdtemp(path11.join(storePaths.tmp, "pkg-"));
  const tarballPath = path11.join(tmpRoot, "package.tgz");
  const extractPath = path11.join(tmpRoot, "extract");
  try {
    const tarball = await downloadTarball(options.resolved);
    verifyIntegrity(tarball, options.integrity);
    await fs12.writeFile(tarballPath, tarball);
    await fs12.ensureDir(extractPath);
    await execFileAsync("tar", ["-xzf", tarballPath, "-C", extractPath]);
    const extractedPackagePath = await getExtractedPackagePath(extractPath);
    await fs12.ensureDir(path11.dirname(options.destinationPath));
    await fs12.move(extractedPackagePath, options.destinationPath, {
      overwrite: false
    });
  } finally {
    await fs12.remove(tmpRoot);
  }
}
async function getExtractedPackagePath(extractPath) {
  const npmPackagePath = path11.join(extractPath, "package");
  if (await fs12.pathExists(npmPackagePath)) {
    return npmPackagePath;
  }
  if (await fs12.pathExists(path11.join(extractPath, "package.json"))) {
    return extractPath;
  }
  const entries = await fs12.readdir(extractPath, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());
  if (directories.length === 1) {
    return path11.join(extractPath, directories[0].name);
  }
  throw new Error("Invalid package tarball: missing package directory");
}
async function downloadTarball(resolved) {
  const response = await fetch(resolved);
  if (!response.ok) {
    throw new Error(`Failed to download package: ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

// packages/store/src/global-store.ts
var LOCK_STALE_MS = 60 * 1e3;
var LOCK_WAIT_MS = 100;
async function ensureNpmPackageInStore(options) {
  const ref = toStorePackageRef(options.pkg);
  const id = getPackageContentId(ref);
  const destinationPath = getPackageStorePath(options.storePath, ref);
  if (!ref.resolved || !ref.integrity) {
    return {
      id,
      name: ref.name,
      version: ref.version,
      storePath: destinationPath,
      status: "skipped"
    };
  }
  const resolved = ref.resolved;
  const integrity = ref.integrity;
  const existed = await fs13.pathExists(destinationPath);
  if (!existed) {
    await withFileLock(`${destinationPath}.lock`, async () => {
      if (await fs13.pathExists(destinationPath)) {
        return;
      }
      await fetchPackageToStore({
        storePath: options.storePath,
        resolved,
        integrity,
        destinationPath
      });
    });
  }
  upsertPackage(options.db, {
    id,
    name: ref.name,
    version: ref.version,
    integrity: ref.integrity,
    resolved: ref.resolved,
    storePath: destinationPath
  });
  return {
    id,
    name: ref.name,
    version: ref.version,
    storePath: destinationPath,
    status: existed ? "reused" : "downloaded"
  };
}
function toStorePackageRef(pkg) {
  return {
    name: pkg.name,
    version: pkg.version,
    integrity: pkg.integrity,
    resolved: pkg.resolved
  };
}
async function withFileLock(lockPath, action) {
  await fs13.ensureDir(path12.dirname(lockPath));
  const lockHandle = await acquireFileLock(lockPath);
  try {
    return await action();
  } finally {
    await lockHandle.close();
    await fs13.remove(lockPath);
  }
}
async function acquireFileLock(lockPath) {
  while (true) {
    try {
      return await nodeFs.open(lockPath, "wx");
    } catch (error) {
      if (!isNodeError(error) || error.code !== "EEXIST") {
        throw error;
      }
      if (await removeStaleLock(lockPath)) {
        continue;
      }
      await sleep(LOCK_WAIT_MS);
    }
  }
}
async function removeStaleLock(lockPath) {
  try {
    const stat = await fs13.stat(lockPath);
    if (Date.now() - stat.mtimeMs <= LOCK_STALE_MS) {
      return false;
    }
    await fs13.remove(lockPath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return true;
    }
    throw error;
  }
}
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
function isNodeError(error) {
  return error instanceof Error && "code" in error;
}

// packages/materializer/src/create-bin-links.ts
import path13 from "path";
import fs14 from "fs-extra";
async function createBinLinks(options) {
  const binDir = path13.join(options.virtualNodeModulesPath, ".bin");
  const linkedBins = [];
  for (const pkg of options.packages) {
    if (!isTopLevelPackagePath2(pkg.packagePath)) {
      continue;
    }
    for (const [binName, binTarget] of Object.entries(pkg.bin)) {
      if (!isSafeBinName(binName) || path13.isAbsolute(binTarget)) {
        continue;
      }
      await fs14.ensureDir(binDir);
      const packageRelativePath = pkg.packagePath.slice("node_modules/".length);
      const absoluteTargetPath = path13.join(options.virtualNodeModulesPath, packageRelativePath, binTarget);
      const linkPath = path13.join(binDir, binName);
      const relativeTargetPath = path13.relative(binDir, absoluteTargetPath);
      await fs14.remove(linkPath);
      await fs14.symlink(relativeTargetPath, linkPath);
      linkedBins.push({
        name: binName,
        linkPath,
        targetPath: absoluteTargetPath
      });
    }
  }
  return linkedBins;
}
function isTopLevelPackagePath2(packagePath) {
  if (!packagePath.startsWith("node_modules/")) {
    return false;
  }
  return !packagePath.slice("node_modules/".length).includes("/node_modules/");
}
function isSafeBinName(binName) {
  return binName.length > 0 && !binName.includes("/") && !binName.includes("\\");
}

// packages/materializer/src/create-node-modules.ts
import path14 from "path";
import fs15 from "fs-extra";
async function createVirtualNodeModules(options) {
  await fs15.remove(options.virtualNodeModulesPath);
  await fs15.ensureDir(options.virtualNodeModulesPath);
  const linkedPackages = [];
  for (const pkg of options.packages) {
    const storePackage = options.storePackages.get(pkg.packagePath);
    if (!storePackage || storePackage.status === "skipped") {
      continue;
    }
    const relativePackagePath = getRelativePackagePath(pkg.packagePath);
    if (!relativePackagePath) {
      continue;
    }
    const linkPath = path14.join(options.virtualNodeModulesPath, relativePackagePath);
    await fs15.ensureDir(path14.dirname(linkPath));
    await fs15.remove(linkPath);
    await linkPackageTree(storePackage.storePath, linkPath);
    linkedPackages.push({
      name: pkg.name,
      version: pkg.version,
      packagePath: pkg.packagePath,
      linkPath,
      targetPath: storePackage.storePath
    });
  }
  await writeNodeValtLinksManifest(
    options.virtualNodeModulesPath,
    linkedPackages.map((pkg) => pkg.targetPath)
  );
  return linkedPackages;
}
function getRelativePackagePath(packagePath) {
  if (!packagePath.startsWith("node_modules/")) {
    return null;
  }
  return packagePath.slice("node_modules/".length);
}

// packages/materializer/src/project-hash.ts
import path15 from "path";
async function getProjectMaterializationHash(projectPathInput) {
  const projectPath = resolveUserPath(projectPathInput);
  const lockfilePath = path15.join(projectPath, "package-lock.json");
  const lockfileHash = await hashFile(lockfilePath) ?? "missing-lockfile";
  return hashString(`${projectPath}\0${lockfileHash}`).slice(0, 24);
}

// packages/materializer/src/materialize-project.ts
async function materializeNpmProject(options) {
  const result = await materializeNpmProjectVirtual(options);
  const activation = await activateVirtualNodeModules({
    projectPath: result.projectPath,
    virtualNodeModulesPath: result.virtualNodeModulesPath
  });
  updateProjectMaterialization(options.db, {
    path: result.projectPath,
    virtualNodeModulesPath: result.virtualNodeModulesPath,
    status: "materialized"
  });
  return {
    ...result,
    ...activation
  };
}
async function materializeNpmProjectVirtual(options) {
  const projectPath = resolveUserPath(options.projectPath);
  const lockfilePath = path16.join(projectPath, "package-lock.json");
  const lockfile = await parseNpmPackageLockFile(lockfilePath);
  const projectHash = await getProjectMaterializationHash(projectPath);
  const virtualNodeModulesPath = path16.join(getStorePaths(options.storePath).projects, projectHash, "node_modules");
  const storePackages = /* @__PURE__ */ new Map();
  const result = {
    projectPath,
    virtualNodeModulesPath,
    packagesResolved: lockfile.packages.length,
    packagesDownloaded: 0,
    packagesReused: 0,
    packagesSkipped: 0,
    packagesLinked: 0,
    binsLinked: 0,
    linkedPackages: [],
    linkedBins: []
  };
  for (const pkg of lockfile.packages) {
    const storePackage = await ensureNpmPackageInStore({
      db: options.db,
      storePath: options.storePath,
      pkg
    });
    storePackages.set(pkg.packagePath, storePackage);
    result[storePackage.status === "downloaded" ? "packagesDownloaded" : storePackage.status === "reused" ? "packagesReused" : "packagesSkipped"] += 1;
  }
  result.linkedPackages = await createVirtualNodeModules({
    virtualNodeModulesPath,
    packages: lockfile.packages,
    storePackages
  });
  result.packagesLinked = result.linkedPackages.length;
  result.linkedBins = await createBinLinks({
    virtualNodeModulesPath,
    packages: lockfile.packages
  });
  result.binsLinked = result.linkedBins.length;
  updateProjectMaterialization(options.db, {
    path: projectPath,
    virtualNodeModulesPath,
    status: "virtualized"
  });
  return result;
}

// packages/materializer/src/materialize-installed-node-modules.ts
import path17 from "path";
import fs16 from "fs-extra";
async function materializeInstalledNodeModules(options) {
  const projectPath = resolveUserPath(options.projectPath);
  const localNodeModulesPath = path17.join(projectPath, "node_modules");
  const sourceNodeModulesPath = await getSourceNodeModulesPath(localNodeModulesPath);
  const projectHash = await getProjectMaterializationHash(projectPath);
  const virtualNodeModulesPath = path17.join(getStorePaths(options.storePath).projects, projectHash, "node_modules");
  const tmpVirtualNodeModulesPath = `${virtualNodeModulesPath}.tmp-${process.pid}-${Date.now()}`;
  const packages = await listInstalledPackages(sourceNodeModulesPath);
  const result = {
    projectPath,
    virtualNodeModulesPath,
    localNodeModulesPath,
    backupPath: null,
    packagesCopied: 0,
    packagesReused: 0,
    packagesLinked: 0,
    packagesSkipped: 0
  };
  await fs16.remove(tmpVirtualNodeModulesPath);
  await fs16.ensureDir(tmpVirtualNodeModulesPath);
  try {
    const referencedStorePaths = [];
    for (const pkg of packages) {
      const storePackage = await ensureInstalledPackageInStore({
        db: options.db,
        storePath: options.storePath,
        sourceNodeModulesPath,
        pkg
      });
      if (!storePackage) {
        result.packagesSkipped += 1;
        continue;
      }
      const linkPath = path17.join(tmpVirtualNodeModulesPath, pkg.relativePath);
      await fs16.ensureDir(path17.dirname(linkPath));
      await linkPackageTree(storePackage.path, linkPath);
      referencedStorePaths.push(storePackage.path);
      result[storePackage.reused ? "packagesReused" : "packagesCopied"] += 1;
      result.packagesLinked += 1;
    }
    await writeNodeValtLinksManifest(tmpVirtualNodeModulesPath, referencedStorePaths);
    await copyBinDirectory(sourceNodeModulesPath, tmpVirtualNodeModulesPath);
    await fs16.remove(virtualNodeModulesPath);
    await fs16.move(tmpVirtualNodeModulesPath, virtualNodeModulesPath);
    const activation = await activateVirtualNodeModules({
      projectPath,
      virtualNodeModulesPath
    });
    updateProjectMaterialization(options.db, {
      path: projectPath,
      virtualNodeModulesPath,
      status: "materialized"
    });
    return {
      ...result,
      ...activation
    };
  } catch (error) {
    await fs16.remove(tmpVirtualNodeModulesPath);
    throw error;
  }
}
async function getSourceNodeModulesPath(localNodeModulesPath) {
  const stat = await fs16.lstat(localNodeModulesPath);
  if (!stat.isDirectory() && !stat.isSymbolicLink()) {
    throw new Error("node_modules is not a directory or symlink");
  }
  if (stat.isSymbolicLink()) {
    return fs16.realpath(localNodeModulesPath);
  }
  return localNodeModulesPath;
}
async function listInstalledPackages(nodeModulesPath) {
  const packages = [];
  const entries = await fs16.readdir(nodeModulesPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".bin" || entry.name.startsWith(".")) {
      continue;
    }
    const entryPath = path17.join(nodeModulesPath, entry.name);
    if (entry.name.startsWith("@") && entry.isDirectory()) {
      const scopedEntries = await fs16.readdir(entryPath, { withFileTypes: true });
      for (const scopedEntry of scopedEntries) {
        if (!scopedEntry.isDirectory() && !scopedEntry.isSymbolicLink()) {
          continue;
        }
        const relativePath = path17.join(entry.name, scopedEntry.name);
        const pkg2 = await readInstalledPackage(path17.join(entryPath, scopedEntry.name), relativePath, scopedEntry.isSymbolicLink());
        if (pkg2) {
          packages.push(pkg2);
        }
      }
      continue;
    }
    if (!entry.isDirectory() && !entry.isSymbolicLink()) {
      continue;
    }
    const pkg = await readInstalledPackage(entryPath, entry.name, entry.isSymbolicLink());
    if (pkg) {
      packages.push(pkg);
    }
  }
  return packages;
}
async function readInstalledPackage(packagePath, relativePath, isSymlink) {
  try {
    const packageJson = await fs16.readJson(path17.join(packagePath, "package.json"));
    if (!packageJson.name || !packageJson.version) {
      return null;
    }
    return {
      name: packageJson.name,
      version: packageJson.version,
      packagePath,
      relativePath,
      isSymlink
    };
  } catch {
    return null;
  }
}
async function ensureInstalledPackageInStore(options) {
  const sourcePath = options.pkg.isSymlink ? await fs16.realpath(options.pkg.packagePath) : options.pkg.packagePath;
  const ref = {
    name: options.pkg.name,
    version: options.pkg.version,
    integrity: null,
    resolved: null
  };
  const destinationPath = getPackageStorePath(options.storePath, ref);
  const existed = await fs16.pathExists(destinationPath);
  if (!existed) {
    await copyPackageToStore(sourcePath, destinationPath);
  }
  upsertPackage(options.db, {
    id: getPackageContentId(ref),
    name: ref.name,
    version: ref.version,
    integrity: ref.integrity,
    resolved: ref.resolved,
    storePath: destinationPath
  });
  return {
    path: destinationPath,
    reused: existed
  };
}
async function copyPackageToStore(sourcePath, destinationPath) {
  const tmpPath = `${destinationPath}.tmp-${process.pid}-${Date.now()}`;
  await fs16.ensureDir(path17.dirname(destinationPath));
  await fs16.remove(tmpPath);
  await fs16.copy(sourcePath, tmpPath, {
    dereference: false
  });
  await fs16.move(tmpPath, destinationPath, {
    overwrite: false
  });
}
async function copyBinDirectory(sourceNodeModulesPath, virtualNodeModulesPath) {
  const sourceBinPath = path17.join(sourceNodeModulesPath, ".bin");
  if (!await fs16.pathExists(sourceBinPath)) {
    return;
  }
  await fs16.copy(sourceBinPath, path17.join(virtualNodeModulesPath, ".bin"), {
    dereference: false
  });
}

// packages/materializer/src/restore-project.ts
import path18 from "path";
import fs17 from "fs-extra";
async function restoreProjectNodeModules(options) {
  const projectPath = resolveUserPath(options.projectPath);
  const nodeModulesPath = path18.join(projectPath, "node_modules");
  const backupPath = await findLatestBackup(projectPath);
  if (!backupPath) {
    throw new Error("No node_modules backup found");
  }
  if (await fs17.pathExists(nodeModulesPath)) {
    const stat = await fs17.lstat(nodeModulesPath);
    const canRemove = stat.isSymbolicLink() || stat.isDirectory() && await isNodeValtManagedNodeModules(nodeModulesPath);
    if (!canRemove) {
      throw new Error("Cannot restore because node_modules exists and is not managed by NodeValt");
    }
    await fs17.remove(nodeModulesPath);
  }
  await fs17.move(backupPath, nodeModulesPath, {
    overwrite: false
  });
  updateProjectStatus(options.db, {
    path: projectPath,
    status: "restored"
  });
  return {
    projectPath,
    restoredFrom: backupPath,
    nodeModulesPath
  };
}
async function findLatestBackup(projectPath) {
  const entries = await fs17.readdir(projectPath, { withFileTypes: true });
  const backups = await Promise.all(
    entries.filter((entry) => entry.isDirectory()).filter((entry) => entry.name.startsWith("node_modules.nodevalt-backup-")).map(async (entry) => {
      const backupPath = path18.join(projectPath, entry.name);
      const stat = await fs17.stat(backupPath);
      return {
        path: backupPath,
        mtimeMs: stat.mtimeMs
      };
    })
  );
  return backups.sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.path ?? null;
}

// packages/scanner/src/scan.ts
import path20 from "path";
import fs19 from "fs-extra";

// packages/scanner/src/package-manager.ts
import path19 from "path";
import fs18 from "fs-extra";
var LOCKFILES2 = [
  { file: "package-lock.json", manager: "npm" },
  { file: "yarn.lock", manager: "yarn" },
  { file: "pnpm-lock.yaml", manager: "pnpm" },
  { file: "bun.lock", manager: "bun" },
  { file: "bun.lockb", manager: "bun" }
];
function packageManagerFromField(value) {
  if (typeof value !== "string") {
    return "unknown";
  }
  const name = value.split("@")[0];
  if (name === "npm" || name === "yarn" || name === "pnpm" || name === "bun") {
    return name;
  }
  return "unknown";
}
async function detectPackageManager(projectPath, packageManagerField) {
  const warnings = [];
  const presentLockfiles = (await Promise.all(
    LOCKFILES2.map(async (candidate) => {
      const lockfilePath = path19.join(projectPath, candidate.file);
      if (!await fs18.pathExists(lockfilePath)) {
        return null;
      }
      const stat = await fs18.stat(lockfilePath);
      return {
        ...candidate,
        path: lockfilePath,
        mtimeMs: stat.mtimeMs
      };
    })
  )).filter((candidate) => candidate !== null);
  const declaredPackageManager = packageManagerFromField(packageManagerField);
  if (presentLockfiles.length === 0) {
    return {
      packageManager: declaredPackageManager,
      lockfilePath: null,
      warnings
    };
  }
  if (presentLockfiles.length === 1) {
    const [candidate] = presentLockfiles;
    return {
      packageManager: candidate.manager,
      lockfilePath: candidate.path,
      warnings
    };
  }
  warnings.push("multiple lockfiles found");
  const declaredMatch = presentLockfiles.find((candidate) => candidate.manager === declaredPackageManager);
  if (declaredMatch) {
    return {
      packageManager: declaredMatch.manager,
      lockfilePath: declaredMatch.path,
      warnings
    };
  }
  const newest = presentLockfiles.sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
  return {
    packageManager: newest.manager,
    lockfilePath: newest.path,
    warnings
  };
}

// packages/scanner/src/scan.ts
async function scanProjects(rootPathInput, options) {
  const rootPath = resolveUserPath(rootPathInput);
  const ignoredDirs = new Set(options.ignoredDirs);
  const projects = [];
  await walk(rootPath, ignoredDirs, projects);
  return projects.sort((a, b) => a.path.localeCompare(b.path));
}
async function walk(currentPath, ignoredDirs, projects) {
  let entries;
  try {
    entries = await fs19.readdir(currentPath, { withFileTypes: true });
  } catch {
    return;
  }
  const hasPackageJson = entries.some((entry) => entry.isFile() && entry.name === "package.json");
  if (hasPackageJson) {
    const project = await readProject(currentPath);
    if (project) {
      projects.push(project);
    }
  }
  await Promise.all(
    entries.filter((entry) => entry.isDirectory()).filter((entry) => !isIgnoredDirectory(entry.name, ignoredDirs)).map((entry) => walk(path20.join(currentPath, entry.name), ignoredDirs, projects))
  );
}
function isIgnoredDirectory(name, ignoredDirs) {
  return ignoredDirs.has(name) || name.startsWith("node_modules.nodevalt-backup-");
}
async function readProject(projectPath) {
  const packageJsonPath = path20.join(projectPath, "package.json");
  let packageJson;
  try {
    packageJson = await fs19.readJson(packageJsonPath);
  } catch {
    return null;
  }
  const detection = await detectPackageManager(projectPath, packageJson.packageManager);
  const lockfileHash = detection.lockfilePath ? await hashFile(detection.lockfilePath) : null;
  const nodeModulesPath = path20.join(projectPath, "node_modules");
  const hasNodeModules = await hasRootNodeModules(nodeModulesPath);
  const nodeModulesSizeBytes = await getDirectorySizeBytes(nodeModulesPath);
  return {
    id: hashString(projectPath).slice(0, 16),
    path: projectPath,
    name: packageJson.name ?? null,
    packageManager: detection.packageManager,
    lockfilePath: detection.lockfilePath,
    lockfileHash,
    nodeModulesPath,
    nodeModulesSizeBytes,
    status: getStatus(detection.packageManager, detection.lockfilePath, hasNodeModules),
    warnings: detection.warnings
  };
}
async function hasRootNodeModules(nodeModulesPath) {
  try {
    const stat = await fs19.lstat(nodeModulesPath);
    return stat.isDirectory() || stat.isSymbolicLink();
  } catch {
    return false;
  }
}
function getStatus(packageManager, lockfilePath, hasNodeModules) {
  if (packageManager !== "npm" && packageManager !== "yarn") {
    return "unsupported";
  }
  if (!lockfilePath) {
    return "missing-lockfile";
  }
  if (!hasNodeModules) {
    return "missing-node-modules";
  }
  return "ready";
}

// packages/store/src/populate-store.ts
import path21 from "path";
async function populateStoreFromNpmProject(options) {
  const projectPath = resolveUserPath(options.projectPath);
  const lockfilePath = path21.join(projectPath, "package-lock.json");
  const lockfile = await parseNpmPackageLockFile(lockfilePath);
  const seen = /* @__PURE__ */ new Set();
  const result = {
    resolved: lockfile.packages.length,
    downloaded: 0,
    reused: 0,
    skipped: 0
  };
  for (const pkg of lockfile.packages) {
    const packageResult = await ensureNpmPackageInStore({
      db: options.db,
      storePath: options.storePath,
      pkg
    });
    if (seen.has(packageResult.id)) {
      continue;
    }
    seen.add(packageResult.id);
    result[packageResult.status] += 1;
  }
  return result;
}

// apps/cli/src/index.ts
var cli = cac("nodevalt");
var execFileAsync2 = promisify2(execFile2);
var LAUNCH_AGENT_LABEL = "com.nodevalt.daemon";
function run(action) {
  action().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exitCode = 1;
  });
}
cli.command("init", "Create NodeValt global store").option("--store <path>", "Custom store path").action(
  (options) => run(async () => {
    const result = await initStore(options.store);
    const db = openNodeValtDatabase(result.storePath);
    db.close();
    console.log("NodeValt initialized");
    console.log(`Store path: ${toDisplayPath(result.storePath)}`);
    console.log(`Config: ${toDisplayPath(result.configFile)}`);
  })
);
cli.command("scan <path>", "Scan a directory for Node.js projects").action(
  (scanPath) => run(async () => {
    const config = await loadOrCreateConfig();
    await addWatchPath(config, scanPath);
    const projects = await scanProjects(scanPath, {
      ignoredDirs: config.ignoredDirs
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
  })
);
cli.command("status", "Show NodeValt status").action(
  () => run(async () => {
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
  })
);
cli.command("store <action> <project>", "Manage the global package store").action(
  (action, project) => run(async () => {
    if (action !== "populate") {
      throw new Error(`Unsupported store action: ${action}`);
    }
    const config = await loadOrCreateConfig();
    const db = openNodeValtDatabase(config.storePath);
    try {
      const result = await populateStoreFromNpmProject({
        db,
        storePath: config.storePath,
        projectPath: project
      });
      console.log("Store populated");
      console.log(`Packages resolved: ${result.resolved}`);
      console.log(`Packages downloaded: ${result.downloaded}`);
      console.log(`Packages reused: ${result.reused}`);
      console.log(`Packages skipped: ${result.skipped}`);
    } finally {
      db.close();
    }
  })
);
cli.command("materialize <project>", "Create virtual node_modules for an npm project").option("--virtual-only", "Do not replace local node_modules").action(
  (project, options) => run(async () => {
    const config = await loadOrCreateConfig();
    const db = openNodeValtDatabase(config.storePath);
    try {
      const commandOptions = {
        db,
        storePath: config.storePath,
        projectPath: project
      };
      let result;
      let activation = null;
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
  })
);
cli.command("restore <project>", "Restore latest node_modules backup").action(
  (project) => run(async () => {
    const config = await loadOrCreateConfig();
    const db = openNodeValtDatabase(config.storePath);
    try {
      const result = await restoreProjectNodeModules({
        db,
        projectPath: project
      });
      console.log("Restored original node_modules from backup");
      console.log(`Project: ${toDisplayPath(result.projectPath)}`);
      console.log(`Restored from: ${toDisplayPath(result.restoredFrom)}`);
    } finally {
      db.close();
    }
  })
);
cli.command("doctor <project>", "Check a NodeValt npm project").action(
  (project) => run(async () => {
    const config = await loadOrCreateConfig();
    const result = await doctorNpmProject({
      storePath: config.storePath,
      projectPath: project
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
  })
);
cli.command("gc", "Remove unreferenced packages from the global store").action(
  () => run(async () => {
    const config = await loadOrCreateConfig();
    const db = openNodeValtDatabase(config.storePath);
    try {
      const result = await collectGarbage({
        db,
        storePath: config.storePath
      });
      console.log(`Unused packages removed: ${result.packagesRemoved}`);
      console.log(`Disk freed: ${formatBytes(result.diskFreedBytes)}`);
    } finally {
      db.close();
    }
  })
);
cli.command("daemon <action>", "Manage NodeValt daemon").option("--path <path>", "Path to scan/watch").option("--scan-interval <seconds>", "Periodic scan interval in seconds", { default: "60" }).option("--no-auto-materialize", "Scan/watch without replacing node_modules").action(
  (action, options) => run(async () => {
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
    let daemon = null;
    let runningCycle = null;
    let stopRequested = false;
    let resolveStop;
    const stopPromise = new Promise((resolve) => {
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
    const runCycle = (reason) => {
      if (runningCycle) {
        return runningCycle;
      }
      runningCycle = runDaemonCycle({
        config,
        db,
        daemon,
        reason,
        autoMaterialize,
        shouldStop: () => stopRequested
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
      }
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
    console.log(`Scan interval: ${Math.round(scanIntervalMs / 1e3)}s`);
    await stopPromise;
    clearInterval(interval);
    await runningCycle;
    await daemon.close();
    db.close();
    console.log("NodeValt daemon stopped");
  })
);
async function ensureDaemonWatchPath(config, watchPathInput) {
  if (watchPathInput) {
    await addWatchPath(config, watchPathInput);
    return;
  }
  if (config.watchPaths.length > 0) {
    return;
  }
  await addWatchPath(config, await getDefaultDaemonWatchPath());
}
async function getDefaultDaemonWatchPath() {
  const projectsPath = path22.join(os2.homedir(), "projetos");
  if (await fs20.pathExists(projectsPath)) {
    return projectsPath;
  }
  return process.cwd();
}
function parseScanIntervalMs(value) {
  const seconds = Number(value ?? "60");
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error("scan interval must be a positive number");
  }
  return seconds * 1e3;
}
async function runDaemonCycle(options) {
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
async function scanConfiguredWatchPaths(config, db) {
  const existingProjects = new Map(listProjects(db).map((project) => [project.path, project]));
  const scannedProjects = /* @__PURE__ */ new Map();
  for (const watchPath of config.watchPaths) {
    const projects = await scanProjects(watchPath, {
      ignoredDirs: config.ignoredDirs
    });
    for (const project of projects) {
      scannedProjects.set(project.path, project);
    }
  }
  for (const project of scannedProjects.values()) {
    upsertProject(db, {
      ...project,
      status: getNextProjectStatus(project, existingProjects.get(project.path))
    });
  }
  return [...scannedProjects.values()];
}
function getNextProjectStatus(project, existingProject) {
  if (existingProject && (existingProject.status === "materialized" || existingProject.status === "virtualized") && existingProject.lockfile_hash === project.lockfileHash) {
    return existingProject.status;
  }
  return project.status;
}
async function materializePendingProjects(db, storePath, shouldStop) {
  const projects = listProjects(db).filter((project) => {
    return !isDaemonOwnProject(project) && ["npm", "yarn"].includes(project.package_manager) && project.lockfile_path && ["ready", "dirty"].includes(project.status);
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
        projectPath: project.path
      });
      console.log(
        `  linked: ${result.packagesLinked}, copied: ${result.packagesCopied}, reused: ${result.packagesReused}`
      );
      materialized += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Materialize failed: ${project.name ?? toDisplayPath(project.path)}: ${message}`);
    }
  }
  return materialized;
}
function isDaemonOwnProject(project) {
  return project.name === "nodevalt" && path22.resolve(project.path) === process.cwd();
}
async function installDaemonLaunchAgent(config, options) {
  await ensureDaemonWatchPath(config, options.path);
  const cliEntryPoint = fileURLToPath(import.meta.url);
  if (!await fs20.pathExists(cliEntryPoint)) {
    throw new Error("Cannot resolve NodeValt CLI entry point");
  }
  const storePaths = getStorePaths(config.storePath);
  await fs20.ensureDir(storePaths.logs);
  await fs20.ensureDir(path22.dirname(getLaunchAgentPath()));
  const programArguments = [
    process.execPath,
    cliEntryPoint,
    "daemon",
    "start",
    "--scan-interval",
    String(Math.round(parseScanIntervalMs(options.scanInterval) / 1e3))
  ];
  if (options.autoMaterialize === false) {
    programArguments.push("--no-auto-materialize");
  }
  const plist = createLaunchAgentPlist({
    programArguments,
    workingDirectory: process.cwd(),
    stdoutPath: path22.join(storePaths.logs, "daemon.out.log"),
    stderrPath: path22.join(storePaths.logs, "daemon.err.log")
  });
  const plistPath = getLaunchAgentPath();
  await fs20.writeFile(plistPath, plist);
  await launchctl(["bootout", getLaunchAgentDomain(), plistPath], true);
  await launchctl(["bootstrap", getLaunchAgentDomain(), plistPath]);
  await launchctl(["kickstart", "-k", `${getLaunchAgentDomain()}/${LAUNCH_AGENT_LABEL}`]);
  console.log("NodeValt daemon installed and started");
  console.log(`LaunchAgent: ${toDisplayPath(plistPath)}`);
  console.log(`Watching: ${config.watchPaths.map(toDisplayPath).join(", ")}`);
  console.log(`Logs: ${toDisplayPath(storePaths.logs)}`);
}
async function uninstallDaemonLaunchAgent() {
  const plistPath = getLaunchAgentPath();
  await launchctl(["bootout", getLaunchAgentDomain(), plistPath], true);
  await fs20.remove(plistPath);
  console.log("NodeValt daemon uninstalled");
}
async function showDaemonLaunchAgentStatus() {
  console.log(`NodeValt daemon: ${await getDaemonLaunchAgentStatus()}`);
}
async function getDaemonLaunchAgentStatus() {
  try {
    const { stdout } = await launchctl(["print", `${getLaunchAgentDomain()}/${LAUNCH_AGENT_LABEL}`]);
    const pid = stdout.match(/pid = (\d+)/)?.[1] ?? "not running";
    return `loaded (${pid})`;
  } catch {
    return "not loaded";
  }
}
function createLaunchAgentPlist(options) {
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
function getLaunchAgentPath() {
  return path22.join(os2.homedir(), "Library", "LaunchAgents", `${LAUNCH_AGENT_LABEL}.plist`);
}
function getLaunchAgentDomain() {
  const uid = process.getuid?.();
  if (uid === void 0) {
    throw new Error("LaunchAgent is only supported on Unix-like systems");
  }
  return `gui/${uid}`;
}
async function launchctl(args, ignoreFailure = false) {
  try {
    return await execFileAsync2("launchctl", args);
  } catch (error) {
    if (ignoreFailure) {
      return { stdout: "", stderr: "" };
    }
    throw error;
  }
}
function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
cli.help();
cli.version("0.1.0");
cli.parse();
//# sourceMappingURL=index.js.map