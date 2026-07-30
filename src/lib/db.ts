import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from '../../db/schema';

export type { BetterSQLite3Database };
// Re-export the Database type so helpers and tests use a stable alias.
export type Database = BetterSQLite3Database<typeof schema>;

/** Default local SQLite file used for dev/build when DATABASE_URL is unset. */
const DEFAULT_DATABASE_URL = 'file:./.data/tailspin.db';

let cachedDb: Database | undefined;

/** Ensure the parent directory exists for a local `file:` SQLite path. */
function ensureLocalDir(url: string): void {
    if (url.startsWith('file:')) {
        const filePath = url.slice('file:'.length);
        if (filePath && filePath !== ':memory:') {
            mkdirSync(dirname(filePath), { recursive: true });
        }
    }
}

/** Resolve a `file:` or bare path into an absolute filesystem path. */
function resolveFilePath(url: string): string {
    if (url.startsWith('file:')) return url.slice('file:'.length);
    return url;
}

/** Create a Drizzle client backed by better-sqlite3 for the given database path. */
export function createDatabase(url: string = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL): Database {
    ensureLocalDir(url);
    const client = new Database(resolveFilePath(url));
    return drizzle(client, { schema });
}

/** Shared singleton database client used by pages at build time. */
export function getDatabase(): Database {
    if (!cachedDb) {
        cachedDb = createDatabase();
    }
    return cachedDb;
}
