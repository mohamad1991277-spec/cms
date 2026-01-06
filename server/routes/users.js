import express from 'express';
import bcrypt from 'bcryptjs';
import db from '../config/database.js';
import { authenticate, adminOnly } from '../middleware/auth.js';

const router = express.Router();

// Get all users (Admin only)
router.get('/', authenticate, adminOnly, async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', role = '', status = '' } = req.query;
        const offset = (page - 1) * limit;

        let query = `
      SELECT id, username, email, role, avatar, status, created_at, updated_at
      FROM users WHERE 1=1
    `;
        let countQuery = 'SELECT COUNT(*) as total FROM users WHERE 1=1';
        const params = [];
        const countParams = [];

        if (search) {
            query += ' AND (username LIKE ? OR email LIKE ?)';
            countQuery += ' AND (username LIKE ? OR email LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
            countParams.push(`%${search}%`, `%${search}%`);
        }

        if (role) {
            query += ' AND role = ?';
            countQuery += ' AND role = ?';
            params.push(role);
            countParams.push(role);
        }

        if (status) {
            query += ' AND status = ?';
            countQuery += ' AND status = ?';
            params.push(status);
            countParams.push(status);
        }

        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(Number(limit), Number(offset));

        const users = await db.prepare(query).all(...params);
        const { total } = await db.prepare(countQuery).get(...countParams);

        res.json({
            users,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

// Get single user
router.get('/:id', authenticate, adminOnly, async (req, res) => {
    try {
        const user = await db.prepare(`
      SELECT id, username, email, role, avatar, status, created_at, updated_at
      FROM users WHERE id = ?
    `).get(req.params.id);

        if (!user) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }

        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

// Create user (Admin only)
router.post('/', authenticate, adminOnly, async (req, res) => {
    try {
        const { username, email, password, role = 'user', status = 'active' } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'يرجى ملء جميع الحقول المطلوبة' });
        }

        // Check if user exists
        const existingUser = await db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);

        if (existingUser) {
            return res.status(400).json({ error: 'اسم المستخدم أو البريد الإلكتروني مستخدم بالفعل' });
        }

        const hashedPassword = bcrypt.hashSync(password, 10);

        const result = await db.prepare(`
      INSERT INTO users (username, email, password, role, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(username, email, hashedPassword, role, status);

        const newUser = await db.prepare(`
      SELECT id, username, email, role, status, created_at
      FROM users WHERE id = ?
    `).get(result.lastID);

        res.status(201).json({ message: 'تم إنشاء المستخدم بنجاح', user: newUser });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

// Update user (Admin only)
router.put('/:id', authenticate, adminOnly, async (req, res) => {
    try {
        const { username, email, password, role, status } = req.body;
        const userId = req.params.id;

        const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

        if (!user) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }

        // Check for duplicates
        if (username || email) {
            const duplicate = await db.prepare(`
        SELECT id FROM users WHERE (username = ? OR email = ?) AND id != ?
      `).get(username || user.username, email || user.email, userId);

            if (duplicate) {
                return res.status(400).json({ error: 'اسم المستخدم أو البريد الإلكتروني مستخدم بالفعل' });
            }
        }

        // Prepare update fields
        let updateQuery = 'UPDATE users SET updated_at = datetime("now")';
        const params = [];

        if (username) {
            updateQuery += ', username = ?';
            params.push(username);
        }
        if (email) {
            updateQuery += ', email = ?';
            params.push(email);
        }
        if (password) {
            updateQuery += ', password = ?';
            params.push(bcrypt.hashSync(password, 10));
        }
        if (role) {
            updateQuery += ', role = ?';
            params.push(role);
        }
        if (status) {
            updateQuery += ', status = ?';
            params.push(status);
        }

        updateQuery += ' WHERE id = ?';
        params.push(userId);

        await db.prepare(updateQuery).run(...params);

        const updatedUser = await db.prepare(`
      SELECT id, username, email, role, status, created_at, updated_at
      FROM users WHERE id = ?
    `).get(userId);

        res.json({ message: 'تم تحديث المستخدم بنجاح', user: updatedUser });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

// Delete user (Admin only)
router.delete('/:id', authenticate, adminOnly, async (req, res) => {
    try {
        const userId = req.params.id;

        // Prevent deleting self
        if (Number(userId) === req.user.id) {
            return res.status(400).json({ error: 'لا يمكنك حذف حسابك الخاص' });
        }

        const user = await db.prepare('SELECT id FROM users WHERE id = ?').get(userId);

        if (!user) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }

        await db.prepare('DELETE FROM users WHERE id = ?').run(userId);

        res.json({ message: 'تم حذف المستخدم بنجاح' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

export default router;
