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

        const targetTables = ['users', 'articles', 'categories'];

        for (const tableName of targetTables) {
            console.log(`\n\n=== Table: ${tableName} ===`);

            console.log(`--- Schema ---`);
            const schema = await db.all(`PRAGMA table_info(${tableName})`);
            console.table(schema);

            console.log(`--- Data (First 5 rows) ---`);
            const data = await db.all(`SELECT * FROM ${tableName} LIMIT 5`);
            console.table(data);
        }

        await db.close();
    } catch (error) {
        console.error('Error reading database:', error);
    }
}

main();
