import express from 'express';
import db from '../config/database.js';
import { authenticate, editorOrAdmin } from '../middleware/auth.js';

const router = express.Router();

// Helper function to generate slug
const generateSlug = (title) => {
    return title
        .toLowerCase()
        .replace(/[^\w\sأ-ي]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
};

// Get all articles (with filters)
router.get('/', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '',
            status = '',
            category = '',
            author = ''
        } = req.query;
        const offset = (page - 1) * limit;

        let query = `
      SELECT 
        a.id, a.title, a.slug, a.excerpt, a.featured_image, a.status,
        a.views, a.created_at, a.updated_at, a.published_at,
        u.username as author_name, u.id as author_id,
        c.name as category_name, c.id as category_id
      FROM articles a
      LEFT JOIN users u ON a.author_id = u.id
      LEFT JOIN categories c ON a.category_id = c.id
      WHERE 1=1
    `;
        let countQuery = 'SELECT COUNT(*) as total FROM articles a WHERE 1=1';
        const params = [];
        const countParams = [];

        if (search) {
            query += ' AND (a.title LIKE ? OR a.content LIKE ?)';
            countQuery += ' AND (a.title LIKE ? OR a.content LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
            countParams.push(`%${search}%`, `%${search}%`);
        }

        if (status) {
            query += ' AND a.status = ?';
            countQuery += ' AND a.status = ?';
            params.push(status);
            countParams.push(status);
        }

        if (category) {
            query += ' AND a.category_id = ?';
            countQuery += ' AND a.category_id = ?';
            params.push(category);
            countParams.push(category);
        }

        if (author) {
            query += ' AND a.author_id = ?';
            countQuery += ' AND a.author_id = ?';
            params.push(author);
            countParams.push(author);
        }

        query += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
        params.push(Number(limit), Number(offset));

        const articles = await db.prepare(query).all(...params);
        const { total } = await db.prepare(countQuery).get(...countParams);

        res.json({
            articles,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get articles error:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

// Get single article
router.get('/:id', async (req, res) => {
    try {
        const article = await db.prepare(`
      SELECT 
        a.*,
        u.username as author_name,
        c.name as category_name
      FROM articles a
      LEFT JOIN users u ON a.author_id = u.id
      LEFT JOIN categories c ON a.category_id = c.id
      WHERE a.id = ? OR a.slug = ?
    `).get(req.params.id, req.params.id);

        if (!article) {
            return res.status(404).json({ error: 'المقال غير موجود' });
        }

        // Increment views
        await db.prepare('UPDATE articles SET views = views + 1 WHERE id = ?').run(article.id);

        res.json(article);
    } catch (error) {
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

// Create article (Editor or Admin)
router.post('/', authenticate, editorOrAdmin, async (req, res) => {
    try {
        const { title, content, excerpt, featured_image, status = 'draft', category_id } = req.body;

        if (!title) {
            return res.status(400).json({ error: 'عنوان المقال مطلوب' });
        }

        let slug = generateSlug(title);

        // Ensure unique slug
        const existingSlug = await db.prepare('SELECT id FROM articles WHERE slug = ?').get(slug);
        if (existingSlug) {
            slug = `${slug}-${Date.now()}`;
        }

        const publishedAt = status === 'published' ? 'datetime("now")' : null;

        const result = await db.prepare(`
      INSERT INTO articles (title, slug, content, excerpt, featured_image, status, category_id, author_id, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${status === 'published' ? 'datetime("now")' : 'NULL'})
    `).run(title, slug, content, excerpt, featured_image, status, category_id || null, req.user.id);

        const newArticle = await db.prepare('SELECT * FROM articles WHERE id = ?').get(result.lastID);

        res.status(201).json({ message: 'تم إنشاء المقال بنجاح', article: newArticle });
    } catch (error) {
        console.error('Create article error:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

// Update article (Editor or Admin)
router.put('/:id', authenticate, editorOrAdmin, async (req, res) => {
    try {
        const { title, content, excerpt, featured_image, status, category_id } = req.body;
        const articleId = req.params.id;

        const article = await db.prepare('SELECT * FROM articles WHERE id = ?').get(articleId);

        if (!article) {
            return res.status(404).json({ error: 'المقال غير موجود' });
        }

        // Check if user is author or admin
        if (req.user.role !== 'admin' && article.author_id !== req.user.id) {
            return res.status(403).json({ error: 'ليس لديك صلاحية تعديل هذا المقال' });
        }

        let updateQuery = 'UPDATE articles SET updated_at = datetime("now")';
        const params = [];

        if (title) {
            updateQuery += ', title = ?';
            params.push(title);

            // Update slug if title changed
            let newSlug = generateSlug(title);
            const existingSlug = await db.prepare('SELECT id FROM articles WHERE slug = ? AND id != ?').get(newSlug, articleId);
            if (existingSlug) {
                newSlug = `${newSlug}-${Date.now()}`;
            }
            updateQuery += ', slug = ?';
            params.push(newSlug);
        }

        if (content !== undefined) {
            updateQuery += ', content = ?';
            params.push(content);
        }

        if (excerpt !== undefined) {
            updateQuery += ', excerpt = ?';
            params.push(excerpt);
        }

        if (featured_image !== undefined) {
            updateQuery += ', featured_image = ?';
            params.push(featured_image);
        }

        if (status) {
            updateQuery += ', status = ?';
            params.push(status);

            // Set published_at if publishing for first time
            if (status === 'published' && !article.published_at) {
                updateQuery += ', published_at = datetime("now")';
            }
        }

        if (category_id !== undefined) {
            updateQuery += ', category_id = ?';
            params.push(category_id || null);
        }

        updateQuery += ' WHERE id = ?';
        params.push(articleId);

        await db.prepare(updateQuery).run(...params);

        const updatedArticle = await db.prepare('SELECT * FROM articles WHERE id = ?').get(articleId);

        res.json({ message: 'تم تحديث المقال بنجاح', article: updatedArticle });
    } catch (error) {
        console.error('Update article error:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

// Delete article (Editor or Admin)
router.delete('/:id', authenticate, editorOrAdmin, async (req, res) => {
    try {
        const articleId = req.params.id;

        const article = await db.prepare('SELECT * FROM articles WHERE id = ?').get(articleId);

        if (!article) {
            return res.status(404).json({ error: 'المقال غير موجود' });
        }

        // Check if user is author or admin
        if (req.user.role !== 'admin' && article.author_id !== req.user.id) {
            return res.status(403).json({ error: 'ليس لديك صلاحية حذف هذا المقال' });
        }

        await db.prepare('DELETE FROM articles WHERE id = ?').run(articleId);

        res.json({ message: 'تم حذف المقال بنجاح' });
    } catch (error) {
        console.error('Delete article error:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

export default router;
