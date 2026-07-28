import { expo } from "./client";
import { File, Paths } from "expo-file-system";

export function exportDatabase(): File {
  const dbPath = expo.databasePath;
  const source = new File(dbPath);
  const dest = new File(Paths.cache, "routinely-backup.db");

  if (dest.exists) {
    dest.delete();
  }

  source.copySync(dest);
  return dest;
}

export function importDatabase(sourceUri: string): void {
  const source = new File(sourceUri);
  const dbPath = expo.databasePath;
  const dest = new File(dbPath);

  expo.closeSync();

  if (dest.exists) {
    dest.delete();
  }
  source.copySync(dest);
}
