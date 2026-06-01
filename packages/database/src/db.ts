import path from "node:path";
import fs from "fs-extra";
import { getStorePaths } from "../../core/src/paths";
import type { PackageRow } from "./packages";
import type { ProjectRow } from "./projects";

export interface EventRow {
  id: string;
  project_id: string | null;
  type: string;
  payload: string;
  status: string;
  created_at: string;
  processed_at: string | null;
}

export interface NodeValtDatabaseData {
  projects: ProjectRow[];
  packages: PackageRow[];
  events: EventRow[];
}

export class NodeValtDatabase {
  constructor(
    private readonly filePath: string,
    readonly data: NodeValtDatabaseData,
  ) {}

  save(): void {
    fs.ensureDirSync(path.dirname(this.filePath));
    fs.writeJsonSync(this.filePath, this.data, { spaces: 2 });
  }

  close(): void {
    this.save();
  }
}

export function openNodeValtDatabase(storePath: string): NodeValtDatabase {
  const databaseFile = getStorePaths(storePath).databaseFile;
  fs.ensureDirSync(path.dirname(databaseFile));

  const data = fs.pathExistsSync(databaseFile)
    ? normalizeDatabaseData(fs.readJsonSync(databaseFile))
    : createEmptyDatabaseData();

  return new NodeValtDatabase(databaseFile, data);
}

function createEmptyDatabaseData(): NodeValtDatabaseData {
  return {
    projects: [],
    packages: [],
    events: [],
  };
}

function normalizeDatabaseData(value: unknown): NodeValtDatabaseData {
  if (!value || typeof value !== "object") {
    return createEmptyDatabaseData();
  }

  const data = value as Partial<NodeValtDatabaseData>;

  return {
    projects: Array.isArray(data.projects) ? data.projects : [],
    packages: Array.isArray(data.packages) ? data.packages : [],
    events: Array.isArray(data.events) ? data.events : [],
  };
}
