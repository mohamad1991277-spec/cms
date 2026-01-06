import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    const dbPath = path.join(__dirname, 'data', 'cms.db');

    try {
        const db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });

        console.log('--- Tables ---');
        const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
        console.log(tables.map(t => t.name).join(', '));

        for (const table of tables) {
            if (table.name === 'sqlite_sequence') continue;
            console.log(`\n--- Schema: ${table.name} ---`);
            const schema = await db.all(`PRAGMA table_info(${table.name})`);
            console.table(schema);

            console.log(`\n--- Data: ${table.name} (Top 3) ---`);
            const data = await db.all(`SELECT * FROM ${table.name} LIMIT 3`);
            console.table(data);
        }

        await db.close();
    } catch (error) {
        console.error('Error reading database:', error);
    }
}

main();
