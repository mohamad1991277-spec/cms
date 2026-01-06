import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/auth.js';
import db from '../config/database.js';

// Authentication middleware
export const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'غير مصرح - يرجى تسجيل الدخول' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        // Get user from database
        const user = await db.prepare('SELECT id, username, email, role, status FROM users WHERE id = ?').get(decoded.userId);

        if (!user) {
            return res.status(401).json({ error: 'المستخدم غير موجود' });
        }

        if (user.status !== 'active') {
            return res.status(403).json({ error: 'الحساب غير مفعل' });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'جلسة غير صالحة - يرجى إعادة تسجيل الدخول' });
    }
};

// Admin only middleware
export const adminOnly = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'هذا الإجراء يتطلب صلاحيات المدير' });
    }
    next();
};

// Editor or Admin middleware
export const editorOrAdmin = (req, res, next) => {
    if (!['admin', 'editor'].includes(req.user.role)) {
        return res.status(403).json({ error: 'هذا الإجراء يتطلب صلاحيات المحرر أو المدير' });
    }
    next();
};

// Log activity middleware
export const logActivity = (action, entityType) => {
    return (req, res, next) => {
        const originalJson = res.json.bind(res);

        res.json = async (data) => {
            // Log only successful actions
            if (res.statusCode >= 200 && res.statusCode < 300) {
                try {
                    const userId = req.user ? req.user.id : null;
                    const entityId = data?.id || req.params?.id || null;
                    const ip = req.ip || req.connection.remoteAddress;

                    await db.prepare(`
            INSERT INTO activity_log (user_id, action, entity_type, entity_id, ip_address)
            VALUES (?, ?, ?, ?, ?)
          `).run(userId, action, entityType, entityId, ip);
                } catch (err) {
                    console.error('Error logging activity:', err);
                }
            }

            return originalJson(data);
        };

        next();
    };
};
