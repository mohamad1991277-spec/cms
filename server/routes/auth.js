import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../config/database.js';
import { JWT_SECRET, JWT_EXPIRES_IN } from '../config/auth.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' });
        }

        const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(email);

        if (!user) {
            return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
        }

        const isValidPassword = bcrypt.compareSync(password, user.password);

        if (!isValidPassword) {
            return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
        }

        if (user.status !== 'active') {
            return res.status(403).json({ error: 'الحساب غير مفعل' });
        }

        // Generate token
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        // Log activity
        await db.prepare(`
      INSERT INTO activity_log (user_id, action, entity_type, entity_id)
      VALUES (?, ?, ?, ?)
    `).run(user.id, 'تسجيل دخول', 'user', user.id);

        res.json({
            message: 'تم تسجيل الدخول بنجاح',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                avatar: user.avatar
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

// Register (for public registration - creates 'user' role)
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'يرجى ملء جميع الحقول المطلوبة' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
        }

        // Check if user exists
        const existingUser = await db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);

        if (existingUser) {
            return res.status(400).json({ error: 'اسم المستخدم أو البريد الإلكتروني مستخدم بالفعل' });
        }

        const hashedPassword = bcrypt.hashSync(password, 10);

        const result = await db.prepare(`
      INSERT INTO users (username, email, password, role, status)
      VALUES (?, ?, ?, 'user', 'active')
    `).run(username, email, hashedPassword);

        const token = jwt.sign({ userId: result.lastID }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        res.status(201).json({
            message: 'تم إنشاء الحساب بنجاح',
            token,
            user: {
                id: result.lastID,
                username,
                email,
                role: 'user'
            }
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
    try {
        const user = await db.prepare(`
      SELECT id, username, email, role, avatar, status, created_at
      FROM users WHERE id = ?
    `).get(req.user.id);

        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

// Update profile
router.put('/profile', authenticate, async (req, res) => {
    try {
        const { username, email, currentPassword, newPassword } = req.body;

        const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

        // If changing password
        if (newPassword) {
            if (!currentPassword) {
                return res.status(400).json({ error: 'يرجى إدخال كلمة المرور الحالية' });
            }

            const isValidPassword = bcrypt.compareSync(currentPassword, user.password);
            if (!isValidPassword) {
                return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
            }

            const hashedPassword = bcrypt.hashSync(newPassword, 10);
            await db.prepare('UPDATE users SET password = ?, updated_at = datetime("now") WHERE id = ?')
                .run(hashedPassword, req.user.id);
        }

        // Update other fields
        if (username || email) {
            // Check for duplicates
            const duplicate = await db.prepare(`
        SELECT id FROM users WHERE (username = ? OR email = ?) AND id != ?
      `).get(username || user.username, email || user.email, req.user.id);

            if (duplicate) {
                return res.status(400).json({ error: 'اسم المستخدم أو البريد الإلكتروني مستخدم بالفعل' });
            }

            await db.prepare(`
        UPDATE users SET username = ?, email = ?, updated_at = datetime("now") WHERE id = ?
      `).run(username || user.username, email || user.email, req.user.id);
        }

        const updatedUser = await db.prepare(`
      SELECT id, username, email, role, avatar, status FROM users WHERE id = ?
    `).get(req.user.id);

        res.json({ message: 'تم تحديث الملف الشخصي', user: updatedUser });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

// Logout (just for logging)
router.post('/logout', authenticate, async (req, res) => {
    try {
        await db.prepare(`
      INSERT INTO activity_log (user_id, action, entity_type, entity_id)
      VALUES (?, ?, ?, ?)
    `).run(req.user.id, 'تسجيل خروج', 'user', req.user.id);

        res.json({ message: 'تم تسجيل الخروج بنجاح' });
    } catch (error) {
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

export default router;
