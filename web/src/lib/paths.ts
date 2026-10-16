import fs from "fs";
import path from "path";

export function repoRoot() {
  return path.join(process.cwd(), "..");
}

export function readRepoFile(...parts: string[]) {
  const file = path.join(repoRoot(), ...parts);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, "utf8");
}

export function readRepoJson<T>(...parts: string[]): T | null {
  const raw = readRepoFile(...parts);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
