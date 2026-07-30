import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDatabase } from '../src/lib/db';

const here = dirname(fileURLToPath(import.meta.url));

async function run(): Promise<void> {
    const db = createDatabase();
    migrate(db, { migrationsFolder: join(here, 'migrations') });
    console.log('Migrations applied.');
}

run()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Migration failed:', error);
        process.exit(1);
    });
