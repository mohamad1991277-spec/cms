import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Import routes
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import articlesRoutes from './routes/articles.js';
import categoriesRoutes from './routes/categories.js';
import dashboardRoutes from './routes/dashboard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Create required directories
const dataDir = path.join(__dirname, '..', 'data');
const uploadsDir = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(cors());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logger for Netlify
app.use((req, res, next) => {
    if (process.env.NETLIFY || process.env.LAMBDA_TASK_ROOT) {
        console.log(`[${req.method}] ${req.path}`);
    }
    next();
});

// Static files (only when not in serverless)
if (!process.env.NETLIFY && !process.env.LAMBDA_TASK_ROOT) {
    app.use('/uploads', express.static(uploadsDir));
    app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
}

// API Routes - Support both with and without /api prefix
const apiRouter = express.Router();
apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', usersRoutes);
apiRouter.use('/articles', articlesRoutes);
apiRouter.use('/categories', categoriesRoutes);
apiRouter.use('/dashboard', dashboardRoutes);

// Mount the api router
app.use('/api', apiRouter);

// Also mount at root for cases where the prefix is stripped/handled by the redirection
app.use('/.netlify/functions/api', apiRouter);

// Health check
app.get(['/api/health', '/.netlify/functions/api/health', '/health'], (req, res) => {
    res.json({
        status: 'ok',
        message: 'نظام إدارة المحتوى يعمل بنجاح!',
        env: process.env.NETLIFY ? 'netlify' : 'local',
        path: req.path
    });
});

// Catch-all route (only for non-API requests and not in serverless)
if (!process.env.NETLIFY && !process.env.LAMBDA_TASK_ROOT) {
    app.get('*', (req, res) => {
        if (!req.path.startsWith('/api')) {
            res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
        }
    });
}

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'حدث خطأ في الخادم' });
});

if (!process.env.NETLIFY && !process.env.LAMBDA_TASK_ROOT) {
    app.listen(PORT, () => {
        console.log(`
    ╔═══════════════════════════════════════════════════════════╗
    ║                                                           ║
    ║        🚀 نظام إدارة المحتوى (CMS)                        ║
    ║                                                           ║
    ║   الخادم يعمل على: http://localhost:${PORT}               ║
    ║                                                           ║
    ║   API Endpoints:                                          ║
    ║   ├── POST   /api/auth/login                             ║
    ║   ├── POST   /api/auth/register                          ║
    ║   ├── GET    /api/auth/me                                ║
    ║   ├── GET    /api/users                                  ║
    ║   ├── GET    /api/articles                               ║
    ║   ├── GET    /api/categories                             ║
    ║   └── GET    /api/dashboard/stats                        ║
    ║                                                           ║
    ╚═══════════════════════════════════════════════════════════╝
      `);
    });
}

export default app;
