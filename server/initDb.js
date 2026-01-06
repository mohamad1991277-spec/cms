import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function init() {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const uploadsDir = path.join(__dirname, '..', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'cms.db');
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await db.run('PRAGMA foreign_keys = ON');

  console.log('🔧 جاري إنشاء قاعدة البيانات...\n');

  // Create Users table
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
    )
  `);
  console.log('✅ تم إنشاء جدول المستخدمين');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ تم إنشاء جدول التصنيفات');

  await db.exec(`
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
    )
  `);
  console.log('✅ تم إنشاء جدول المقالات');

  await db.exec(`
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
    )
  `);
  console.log('✅ تم إنشاء جدول سجل النشاطات');

  await db.exec(`
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
    )
  `);
  console.log('✅ تم إنشاء جدول الوسائط');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT,
      type TEXT DEFAULT 'text',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ تم إنشاء جدول الإعدادات');

  const hashedPassword = bcrypt.hashSync('admin123', 10);
  const admin = await db.get('SELECT id FROM users WHERE username = ?', 'admin');

  if (!admin) {
    await db.run(`
      INSERT INTO users (username, email, password, role, status)
      VALUES (?, ?, ?, ?, ?)
    `, 'admin', 'admin@cms.com', hashedPassword, 'admin', 'active');
    console.log('\n👤 تم إنشاء حساب المدير الافتراضي: admin@cms.com / admin123');
  }

  const editor = await db.get('SELECT id FROM users WHERE username = ?', 'editor');
  if (!editor) {
    const editorPassword = bcrypt.hashSync('editor123', 10);
    await db.run(`
      INSERT INTO users (username, email, password, role, status)
      VALUES (?, ?, ?, ?, ?)
    `, 'editor', 'editor@cms.com', editorPassword, 'editor', 'active');
  }

  // Categories
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

  // Articles
  const articlesCount = await db.get('SELECT COUNT(*) as count FROM articles');
  if (articlesCount.count === 0) {
    await db.run(`
      INSERT INTO articles (title, slug, content, excerpt, status, category_id, author_id, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, 'مرحباً بك في نظام إدارة المحتوى', 'welcome-to-cms', 'هذا هو أول مقال في النظام.', 'مقدمة عن نظام إدارة المحتوى', 'published', 4, 1);
  }

  // Settings
  const settingsCount = await db.get('SELECT COUNT(*) as count FROM settings');
  if (settingsCount.count === 0) {
    const defaultSettings = [
      ['site_name', 'نظام إدارة المحتوى', 'text'],
      ['site_description', 'نظام متكامل لإدارة المحتوى', 'text'],
      ['articles_per_page', '10', 'number'],
      ['maintenance_mode', 'false', 'boolean']
    ];
    for (const setting of defaultSettings) {
      await db.run('INSERT INTO settings (key, value, type) VALUES (?, ?, ?)', ...setting);
    }
  }

  await db.close();
  console.log('\n✅ تم إعداد قاعدة البيانات بنجاح!');
}

init().catch(console.error);
