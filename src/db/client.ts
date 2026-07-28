import { drizzle } from "drizzle-orm/expo-sqlite";
import { openDatabaseSync } from "expo-sqlite";
import * as schema from "./schema";

export const expo = openDatabaseSync("routinely.db");

export const db = drizzle(expo, { schema });
