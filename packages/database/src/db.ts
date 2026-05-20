import Database from "better-sqlite3";
import { getStorePaths } from "../../core/src/paths";
import { runMigrations } from "./migrations";

export function openNodeValtDatabase(storePath: string): Database.Database {
  const db = new Database(getStorePaths(storePath).databaseFile);
  runMigrations(db);
  return db;
}
