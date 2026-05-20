import type Database from "better-sqlite3";
import { hashString } from "../../core/src/paths";

export interface EventInput {
  projectId: string | null;
  type: string;
  payload: Record<string, unknown>;
  status: string;
}

export function insertEvent(db: Database.Database, input: EventInput): string {
  const now = new Date().toISOString();
  const id = hashString(`${input.type}\0${JSON.stringify(input.payload)}\0${now}`);

  db.prepare(`
    INSERT INTO events (
      id,
      project_id,
      type,
      payload,
      status,
      created_at,
      processed_at
    )
    VALUES (
      @id,
      @projectId,
      @type,
      @payload,
      @status,
      @now,
      NULL
    )
  `).run({
    id,
    projectId: input.projectId,
    type: input.type,
    payload: JSON.stringify(input.payload),
    status: input.status,
    now,
  });

  return id;
}
