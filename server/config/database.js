import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Detect if running on Netlify or similar serverless environment
const isServerless = process.env.NETLIFY || process.env.LAMBDA_TASK_ROOT || process.env.VERCEL;

// Use /tmp for database in serverless environments as it's the only writable directory
const dataDir = isServerless
    ? '/tmp'
    : path.join(__dirname, '..', '..', 'data');

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'cms.db');

// Database initialization logic for serverless
const initializeDb = async (db) => {
    console.log('🔧 Initializing database in ' + dbPath);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT CHECK(role IN ('admin', 'editor', 'user')) DEFAULT 'user',
            avatar TEXT,
            status TEXT CHECK(status IN ('active', 'inactive')) DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            content TEXT,
            excerpt TEXT,
            featured_image TEXT,
            status TEXT CHECK(status IN ('draft', 'published', 'archived')) DEFAULT 'draft',
            category_id INTEGER,
            author_id INTEGER NOT NULL,
            views INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            published_at DATETIME,
            FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
            FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT NOT NULL,
            entity_type TEXT,
            entity_id INTEGER,
            details TEXT,
            ip_address TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS media (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            original_name TEXT NOT NULL,
            mime_type TEXT,
            size INTEGER,
            path TEXT NOT NULL,
            uploaded_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
        );
        
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE NOT NULL,
            value TEXT,
            type TEXT DEFAULT 'text',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Add default admin if not exists
    const admin = await db.get('SELECT id FROM users WHERE username = ?', 'admin');
    if (!admin) {
        const hashedPassword = bcrypt.hashSync('admin123', 10);
        await db.run(`
            INSERT INTO users (username, email, password, role, status)
            VALUES (?, ?, ?, ?, ?)
        `, 'admin', 'admin@cms.com', hashedPassword, 'admin', 'active');
    }

    // Add default Categories
    const categoriesCount = await db.get('SELECT COUNT(*) as count FROM categories');
    if (categoriesCount.count === 0) {
        const defaultCategories = [
            ['أخبار', 'news', 'آخر الأخبار والمستجدات'],
            ['تقنية', 'technology', 'مقالات تقنية متنوعة'],
            ['رياضة', 'sports', 'أخبار رياضية'],
            ['عام', 'general', 'مقالات عامة']
        ];
        for (const cat of defaultCategories) {
            await db.run('INSERT INTO categories (name, slug, description) VALUES (?, ?, ?)', ...cat);
        }
    }
};

// Open database helper
const openDb = async () => {
    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    // Check if tables exist, if not initialize
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='users'");
    if (tables.length === 0) {
        await initializeDb(db);
    }

    return db;
};

// Singleton database instance
let dbInstance = null;

const getDb = async () => {
    if (!dbInstance) {
        dbInstance = await openDb();
        await dbInstance.run('PRAGMA foreign_keys = ON');
    }
    return dbInstance;
};

// Database wrapper
const db = {
    get: async (sql, params) => (await getDb()).get(sql, params),
    all: async (sql, params) => (await getDb()).all(sql, params),
    run: async (sql, params) => (await getDb()).run(sql, params),
    exec: async (sql) => (await getDb()).exec(sql),
    prepare: (sql) => {
        return {
            get: async (...params) => (await getDb()).get(sql, ...params),
            all: async (...params) => (await getDb()).all(sql, ...params),
            run: async (...params) => (await getDb()).run(sql, ...params),
        };
    }
};

export default db;
export { getDb };
