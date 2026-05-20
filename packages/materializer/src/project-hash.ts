import path from "node:path";
import { hashFile, hashString, resolveUserPath } from "../../core/src/paths";

export async function getProjectMaterializationHash(projectPathInput: string): Promise<string> {
  const projectPath = resolveUserPath(projectPathInput);
  const lockfilePath = path.join(projectPath, "package-lock.json");
  const lockfileHash = (await hashFile(lockfilePath)) ?? "missing-lockfile";

  return hashString(`${projectPath}\0${lockfileHash}`).slice(0, 24);
}
