import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as schema from './schema';
import type { Database as DrizzleDb } from '../src/lib/db';

const here = dirname(fileURLToPath(import.meta.url));

/** Create a fresh in-memory SQLite database with the schema migrated in. */
export function createTestDatabase(): DrizzleDb {
    const client = new Database(':memory:');
    const db = drizzle(client, { schema });
    migrate(db, { migrationsFolder: join(here, 'migrations') });
    return db;
}
