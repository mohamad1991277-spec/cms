import express from 'express';
import db from '../config/database.js';
import { authenticate, adminOnly } from '../middleware/auth.js';

const router = express.Router();

// Get all categories
router.get('/', async (req, res) => {
    try {
        const categories = await db.prepare(`
      SELECT c.*, 
        (SELECT COUNT(*) FROM articles WHERE category_id = c.id) as articles_count
      FROM categories c
      ORDER BY c.name ASC
    `).all();

        res.json(categories);
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

// Get single category
router.get('/:id', async (req, res) => {
    try {
        const category = await db.prepare(`
      SELECT c.*, 
        (SELECT COUNT(*) FROM articles WHERE category_id = c.id) as articles_count
      FROM categories c
      WHERE c.id = ? OR c.slug = ?
    `).get(req.params.id, req.params.id);

        if (!category) {
            return res.status(404).json({ error: 'التصنيف غير موجود' });
        }

        res.json(category);
    } catch (error) {
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

// Create category (Admin only)
router.post('/', authenticate, adminOnly, async (req, res) => {
    try {
        const { name, description } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'اسم التصنيف مطلوب' });
        }

        // Generate slug
        let slug = name
            .toLowerCase()
            .replace(/[^\w\sأ-ي]/g, '')
            .replace(/\s+/g, '-')
            .trim();

        // Ensure unique slug
        const existingSlug = await db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug);
        if (existingSlug) {
            slug = `${slug}-${Date.now()}`;
        }

        const result = await db.prepare(`
      INSERT INTO categories (name, slug, description)
      VALUES (?, ?, ?)
    `).run(name, slug, description || null);

        const newCategory = await db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastID);

        res.status(201).json({ message: 'تم إنشاء التصنيف بنجاح', category: newCategory });
    } catch (error) {
        console.error('Create category error:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

// Update category (Admin only)
router.put('/:id', authenticate, adminOnly, async (req, res) => {
    try {
        const { name, description } = req.body;
        const categoryId = req.params.id;

        const category = await db.prepare('SELECT * FROM categories WHERE id = ?').get(categoryId);

        if (!category) {
            return res.status(404).json({ error: 'التصنيف غير موجود' });
        }

        let updateQuery = 'UPDATE categories SET';
        const params = [];
        const updates = [];

        if (name) {
            updates.push(' name = ?');
            params.push(name);

            // Update slug
            let newSlug = name
                .toLowerCase()
                .replace(/[^\w\sأ-ي]/g, '')
                .replace(/\s+/g, '-')
                .trim();

            const existingSlug = await db.prepare('SELECT id FROM categories WHERE slug = ? AND id != ?').get(newSlug, categoryId);
            if (existingSlug) {
                newSlug = `${newSlug}-${Date.now()}`;
            }
            updates.push(' slug = ?');
            params.push(newSlug);
        }

        if (description !== undefined) {
            updates.push(' description = ?');
            params.push(description);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'لا توجد بيانات للتحديث' });
        }

        updateQuery += updates.join(',') + ' WHERE id = ?';
        params.push(categoryId);

        await db.prepare(updateQuery).run(...params);

        const updatedCategory = await db.prepare('SELECT * FROM categories WHERE id = ?').get(categoryId);

        res.json({ message: 'تم تحديث التصنيف بنجاح', category: updatedCategory });
    } catch (error) {
        console.error('Update category error:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

// Delete category (Admin only)
router.delete('/:id', authenticate, adminOnly, async (req, res) => {
    try {
        const categoryId = req.params.id;

        const category = await db.prepare('SELECT * FROM categories WHERE id = ?').get(categoryId);

        if (!category) {
            return res.status(404).json({ error: 'التصنيف غير موجود' });
        }

        // Check if category has articles
        const articlesCount = await db.prepare('SELECT COUNT(*) as count FROM articles WHERE category_id = ?').get(categoryId);

        if (articlesCount.count > 0) {
            // Set articles' category to null
            await db.prepare('UPDATE articles SET category_id = NULL WHERE category_id = ?').run(categoryId);
        }

        await db.prepare('DELETE FROM categories WHERE id = ?').run(categoryId);

        res.json({ message: 'تم حذف التصنيف بنجاح' });
    } catch (error) {
        console.error('Delete category error:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

export default router;
