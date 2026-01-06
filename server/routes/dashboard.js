import express from 'express';
import db from '../config/database.js';
import { authenticate, adminOnly } from '../middleware/auth.js';

const router = express.Router();

// Get dashboard stats
router.get('/stats', authenticate, async (req, res) => {
    try {
        // Total users
        const { totalUsers } = await db.prepare('SELECT COUNT(*) as totalUsers FROM users').get();

        // Total articles
        const { totalArticles } = await db.prepare('SELECT COUNT(*) as totalArticles FROM articles').get();

        // Published articles
        const { publishedArticles } = await db.prepare(
            "SELECT COUNT(*) as publishedArticles FROM articles WHERE status = 'published'"
        ).get();

        // Draft articles
        const { draftArticles } = await db.prepare(
            "SELECT COUNT(*) as draftArticles FROM articles WHERE status = 'draft'"
        ).get();

        // Total views
        const { totalViews } = await db.prepare('SELECT SUM(views) as totalViews FROM articles').get();

        // Total categories
        const { totalCategories } = await db.prepare('SELECT COUNT(*) as totalCategories FROM categories').get();

        // Users by role
        const usersByRole = await db.prepare(`
      SELECT role, COUNT(*) as count FROM users GROUP BY role
    `).all();

        // Articles by status
        const articlesByStatus = await db.prepare(`
      SELECT status, COUNT(*) as count FROM articles GROUP BY status
    `).all();

        // Recent articles
        const recentArticles = await db.prepare(`
      SELECT a.id, a.title, a.status, a.created_at, u.username as author_name
      FROM articles a
      LEFT JOIN users u ON a.author_id = u.id
      ORDER BY a.created_at DESC
      LIMIT 5
    `).all();

        // Recent activities
        const recentActivities = await db.prepare(`
      SELECT al.*, u.username
      FROM activity_log al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC
      LIMIT 10
    `).all();

        // Top articles by views
        const topArticles = await db.prepare(`
      SELECT id, title, views FROM articles
      ORDER BY views DESC
      LIMIT 5
    `).all();

        // Articles per category
        const articlesPerCategory = await db.prepare(`
      SELECT c.name, COUNT(a.id) as count
      FROM categories c
      LEFT JOIN articles a ON c.id = a.category_id
      GROUP BY c.id
      ORDER BY count DESC
    `).all();

        res.json({
            stats: {
                totalUsers,
                totalArticles,
                publishedArticles,
                draftArticles,
                totalViews: totalViews || 0,
                totalCategories
            },
            usersByRole,
            articlesByStatus,
            recentArticles,
            recentActivities,
            topArticles,
            articlesPerCategory
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

// Get activity log
router.get('/activities', authenticate, adminOnly, async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        const activities = await db.prepare(`
      SELECT al.*, u.username
      FROM activity_log al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC
      LIMIT ? OFFSET ?
    `).all(Number(limit), Number(offset));

        const { total } = await db.prepare('SELECT COUNT(*) as total FROM activity_log').get();

        res.json({
            activities,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get activities error:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

// Get settings
router.get('/settings', authenticate, adminOnly, async (req, res) => {
    try {
        const settings = await db.prepare('SELECT * FROM settings').all();

        // Convert to key-value object
        const settingsObj = {};
        settings.forEach(s => {
            settingsObj[s.key] = {
                value: s.value,
                type: s.type
            };
        });

        res.json(settingsObj);
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

// Update settings
router.put('/settings', authenticate, adminOnly, async (req, res) => {
    try {
        const settings = req.body;

        const updateStmt = db.prepare(`
      UPDATE settings SET value = ?, updated_at = datetime("now") WHERE key = ?
    `);

        const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO settings (key, value, type) VALUES (?, ?, ?)
    `);

        for (const [key, data] of Object.entries(settings)) {
            const existing = await db.prepare('SELECT id FROM settings WHERE key = ?').get(key);

            if (existing) {
                await updateStmt.run(data.value, key);
            } else {
                await insertStmt.run(key, data.value, data.type || 'text');
            }
        }

        res.json({ message: 'تم تحديث الإعدادات بنجاح' });
    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

export default router;
