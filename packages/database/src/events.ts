import { hashString } from "../../core/src/paths";
import type { NodeValtDatabase } from "./db";

export interface EventInput {
  projectId: string | null;
  type: string;
  payload: Record<string, unknown>;
  status: string;
}

export function insertEvent(db: NodeValtDatabase, input: EventInput): string {
  const now = new Date().toISOString();
  const id = hashString(`${input.type}\0${JSON.stringify(input.payload)}\0${now}`);

  db.data.events.push({
    id,
    project_id: input.projectId,
    type: input.type,
    payload: JSON.stringify(input.payload),
    status: input.status,
    created_at: now,
    processed_at: null,
  });
  db.save();

  return id;
}
