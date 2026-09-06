const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const next = require('next');
require('dotenv').config();

const app = express();
const nextApp = next({ dev: process.env.NODE_ENV !== 'production', dir: __dirname });
const nextHandle = nextApp.getRequestHandler();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'blog-data.json');
let databaseAvailable = false;
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

app.disable('x-powered-by');
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", 'https://cdnjs.cloudflare.com'],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com', 'data:'],
            imgSrc: ["'self'", 'https:', 'data:'],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"]
        }
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors((req, callback) => {
    const origin = req.header('Origin');
    const isAllowed = !origin || allowedOrigins.includes(origin);
    callback(null, { origin: isAllowed });
}));
app.use(compression());
app.use(express.json({ limit: '1mb' }));

const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Please try again later.' }
});

app.use(express.static(path.join(__dirname), {
    maxAge: '1d',
    etag: true,
    lastModified: true,
    index: false
}));

function normalizePost(row) {
    return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        excerpt: row.excerpt,
        category: row.category,
        categoryLabel: row.categorylabel,
        author: row.author,
        date: row.date,
        readTime: row.readtime,
        featured: row.featured,
        image: row.image,
        tags: row.tags || [],
        content: row.content,
        sourceDocumentName: row.source_document_name || null
    };
}

async function createBootstrapAdmin() {
    const username = String(process.env.ADMIN_BOOTSTRAP_USERNAME || '').trim();
    const email = String(process.env.ADMIN_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
    const password = String(process.env.ADMIN_BOOTSTRAP_PASSWORD || '');

    if (!username || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
        return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
        `INSERT INTO admin_users (username, email, password_hash, approved, is_super_admin)
         VALUES ($1, $2, $3, true, true)
         ON CONFLICT (email) DO UPDATE SET
            approved = true,
            is_super_admin = true
         RETURNING (xmax = 0) AS created`,
        [username, email, passwordHash]
    );
    console.log(`${result.rows[0].created ? 'Created' : 'Updated'} bootstrap super admin account for ${email}`);
}

async function initDatabase() {
    await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');

    await pool.query(`
        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            count INTEGER NOT NULL DEFAULT 0
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS posts (
            id TEXT PRIMARY KEY,
            slug TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            excerpt TEXT,
            category TEXT REFERENCES categories(id) ON DELETE SET NULL,
            categoryLabel TEXT,
            author TEXT,
            date TEXT,
            readTime TEXT,
            featured BOOLEAN DEFAULT false,
            image TEXT,
            tags JSONB DEFAULT '[]',
            content TEXT
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value JSONB NOT NULL
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS admin_users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            username TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            approved BOOLEAN NOT NULL DEFAULT false,
            is_super_admin BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS admin_sessions (
            token_hash TEXT PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
            expires_at TIMESTAMPTZ NOT NULL
        );
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_posts_featured ON posts(featured);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);`);
    await pool.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS source_document_name TEXT;`);
    await pool.query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT false;`);
    await pool.query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;`);

    await createBootstrapAdmin();
    await loadDefaultDataIfEmpty();
    databaseAvailable = true;
}

async function loadDefaultDataIfEmpty() {
    const { rows } = await pool.query('SELECT 1 FROM posts LIMIT 1');
    if (rows.length > 0) {
        return;
    }

    try {
        const content = await fs.readFile(DATA_FILE, 'utf-8');
        const defaultData = JSON.parse(content);

        if (Array.isArray(defaultData.categories)) {
            for (const category of defaultData.categories) {
                await pool.query(
                    `INSERT INTO categories (id, name, count) VALUES ($1, $2, $3)
                     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, count = EXCLUDED.count;`,
                    [category.id, category.name, category.count || 0]
                );
            }
        }

        if (Array.isArray(defaultData.posts)) {
            for (const post of defaultData.posts) {
                await pool.query(
                    `INSERT INTO posts (id, slug, title, excerpt, category, categoryLabel, author, date, readTime, featured, image, tags, content)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
                     ON CONFLICT (id) DO UPDATE SET
                        slug = EXCLUDED.slug,
                        title = EXCLUDED.title,
                        excerpt = EXCLUDED.excerpt,
                        category = EXCLUDED.category,
                        categoryLabel = EXCLUDED.categoryLabel,
                        author = EXCLUDED.author,
                        date = EXCLUDED.date,
                        readTime = EXCLUDED.readTime,
                        featured = EXCLUDED.featured,
                        image = EXCLUDED.image,
                        tags = EXCLUDED.tags,
                        content = EXCLUDED.content;`,
                    [
                        post.id,
                        post.slug,
                        post.title,
                        post.excerpt,
                        post.category,
                        post.categoryLabel,
                        post.author,
                        post.date,
                        post.readTime,
                        post.featured || false,
                        post.image || null,
                        JSON.stringify(post.tags || []),
                        post.content || ''
                    ]
                );
            }
        }

        await updateCategoryCounts();
        console.log('Loaded default blog data into Postgres');
    } catch (error) {
        console.error('Failed to load default data:', error.message);
    }
}

async function updateCategoryCounts() {
    await pool.query(`
        UPDATE categories
        SET count = COALESCE(sub.count, 0)
        FROM (
            SELECT category, COUNT(*) AS count
            FROM posts
            GROUP BY category
        ) AS sub
        WHERE categories.id = sub.category;
    `);

    await pool.query(`
        UPDATE categories
        SET count = 0
        WHERE id NOT IN (SELECT category FROM posts);
    `);
}

app.get('/api/health', (req, res) => {
    if (!databaseAvailable) {
        return res.status(503).json({ status: 'database-unavailable' });
    }
    res.json({ status: 'ok' });
});

function createSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

function hashSessionToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function setSessionCookie(res, token) {
    const secureAttribute = isProduction ? '; Secure' : '';
    res.setHeader('Set-Cookie', `legitways_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${secureAttribute}`);
}

function getSessionToken(req) {
    const cookies = String(req.headers.cookie || '').split(';');
    const sessionCookie = cookies.find(cookie => cookie.trim().startsWith('legitways_session='));
    return sessionCookie ? sessionCookie.trim().slice('legitways_session='.length) : null;
}

async function requireAdmin(req, res, next) {
    if (!databaseAvailable) {
        return res.status(503).json({ error: 'Database is unavailable' });
    }

    const token = getSessionToken(req);
    if (!token) {
        return res.status(401).json({ error: 'Admin login required' });
    }

    let result;
    try {
        result = await pool.query(
            `SELECT admin_users.id, admin_users.username, admin_users.email,
                    admin_users.approved, admin_users.is_super_admin AS "isSuperAdmin"
             FROM admin_sessions
             JOIN admin_users ON admin_users.id = admin_sessions.user_id
                         WHERE admin_sessions.token_hash = $1
                             AND admin_sessions.expires_at > NOW()
                             AND admin_users.approved = true`,
            [hashSessionToken(token)]
        );
    } catch (error) {
        return res.status(503).json({ error: 'Database is unavailable' });
    }

    if (!result.rows[0]) {
        return res.status(401).json({ error: 'Admin session expired' });
    }

    req.adminUser = result.rows[0];
    next();
}

async function requireSuperAdmin(req, res, next) {
    await requireAdmin(req, res, () => {
        if (!req.adminUser.isSuperAdmin) {
            return res.status(403).json({ error: 'Super admin approval required' });
        }
        next();
    });
}

app.post('/api/auth/register', authRateLimit, async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!username || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
        return res.status(400).json({ error: 'Username, valid email, and password of at least 8 characters are required' });
    }

    try {
        const passwordHash = await bcrypt.hash(password, 12);
        const result = await pool.query(
            `INSERT INTO admin_users (username, email, password_hash, approved, is_super_admin)
             VALUES ($1, $2, $3, false, false)
             RETURNING id, username, email, approved`,
            [username, email, passwordHash]
        );
        res.status(202).json({ pending: true, user: result.rows[0] });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'An account with that email already exists' });
        }
        console.error('Admin registration failed:', error.message);
        res.status(500).json({ error: 'Unable to create admin account' });
    }
});

app.post('/api/auth/login', authRateLimit, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    let result;
    try {
        result = await pool.query(
            'SELECT id, username, email, password_hash, approved, is_super_admin FROM admin_users WHERE email = $1 LIMIT 1',
            [email]
        );
    } catch (error) {
        return res.status(503).json({ error: 'Database is unavailable' });
    }

    if (!result.rows[0] || !(await bcrypt.compare(password, result.rows[0].password_hash))) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!result.rows[0].approved) {
        return res.status(403).json({ error: 'Your admin account is waiting for super admin approval.' });
    }

    const token = createSessionToken();
    await pool.query(
        `INSERT INTO admin_sessions (token_hash, user_id, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
        [hashSessionToken(token), result.rows[0].id]
    );
    setSessionCookie(res, token);
    res.json({
        user: {
            id: result.rows[0].id,
            username: result.rows[0].username,
            email: result.rows[0].email,
            approved: result.rows[0].approved,
            isSuperAdmin: result.rows[0].is_super_admin
        }
    });
});

app.get('/api/auth/session', requireAdmin, (req, res) => {
    res.json({ user: req.adminUser });
});

app.get('/api/admin/pending', requireSuperAdmin, async (req, res) => {
    const result = await pool.query(
        `SELECT id, username, email, created_at
         FROM admin_users
         WHERE approved = false
         ORDER BY created_at ASC`
    );
    res.json(result.rows);
});

app.post('/api/admin/:id/approve', requireSuperAdmin, async (req, res) => {
    const result = await pool.query(
        `UPDATE admin_users
         SET approved = true
         WHERE id = $1
         RETURNING id, username, email, approved, is_super_admin`,
        [req.params.id]
    );
    if (!result.rows[0]) {
        return res.status(404).json({ error: 'Admin account not found' });
    }
    res.json(result.rows[0]);
});

app.delete('/api/admin/:id', requireSuperAdmin, async (req, res) => {
    if (req.params.id === req.adminUser.id) {
        return res.status(400).json({ error: 'You cannot remove your own super admin account' });
    }
    const result = await pool.query('DELETE FROM admin_users WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) {
        return res.status(404).json({ error: 'Admin account not found' });
    }
    res.status(204).end();
});

app.post('/api/auth/logout', async (req, res) => {
    const token = getSessionToken(req);
    try {
        if (token && databaseAvailable) {
            await pool.query('DELETE FROM admin_sessions WHERE token_hash = $1', [hashSessionToken(token)]);
        }
    } catch (error) {
        console.error('Admin logout cleanup failed:', error.message);
    }
    const secureAttribute = isProduction ? '; Secure' : '';
    res.setHeader('Set-Cookie', `legitways_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureAttribute}`);
    res.status(204).end();
});

app.get('/api/posts', async (req, res) => {
    const result = await pool.query('SELECT * FROM posts ORDER BY date DESC NULLS LAST');
    res.json(result.rows.map(normalizePost));
});

app.get('/api/posts/slug/:slug', async (req, res) => {
    const result = await pool.query('SELECT * FROM posts WHERE slug = $1 LIMIT 1', [req.params.slug]);
    if (!result.rows[0]) {
        return res.status(404).json({ error: 'Post not found' });
    }
    res.json(normalizePost(result.rows[0]));
});

app.get('/api/posts/category/:category', async (req, res) => {
    const result = await pool.query('SELECT * FROM posts WHERE category = $1 ORDER BY date DESC NULLS LAST', [req.params.category]);
    res.json(result.rows.map(normalizePost));
});

app.get('/api/posts/featured', async (req, res) => {
    const result = await pool.query('SELECT * FROM posts WHERE featured = true ORDER BY date DESC NULLS LAST');
    res.json(result.rows.map(normalizePost));
});

app.get('/api/posts/search', async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q) {
        const result = await pool.query('SELECT * FROM posts ORDER BY date DESC NULLS LAST');
        return res.json(result.rows.map(normalizePost));
    }

    const searchTerm = `%${q}%`;
    const result = await pool.query(
        `SELECT * FROM posts
         WHERE title ILIKE $1 OR excerpt ILIKE $1 OR categoryLabel ILIKE $1 OR tags::text ILIKE $1
         ORDER BY date DESC NULLS LAST`,
        [searchTerm]
    );
    res.json(result.rows.map(normalizePost));
});

app.post('/api/posts', requireAdmin, async (req, res) => {
    const post = req.body;
    if (!post || !post.id || !post.slug || !post.title) {
        return res.status(400).json({ error: 'Post id, slug, and title are required' });
    }

    await pool.query(
        `INSERT INTO posts (id, slug, title, excerpt, category, categoryLabel, author, date, readTime, featured, image, tags, content, source_document_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (id) DO UPDATE SET
           slug = EXCLUDED.slug,
           title = EXCLUDED.title,
           excerpt = EXCLUDED.excerpt,
           category = EXCLUDED.category,
           categoryLabel = EXCLUDED.categoryLabel,
           author = EXCLUDED.author,
           date = EXCLUDED.date,
           readTime = EXCLUDED.readTime,
           featured = EXCLUDED.featured,
           image = EXCLUDED.image,
           tags = EXCLUDED.tags,
           content = EXCLUDED.content,
           source_document_name = EXCLUDED.source_document_name;`,
        [
            post.id,
            post.slug,
            post.title,
            post.excerpt || null,
            post.category || null,
            post.categoryLabel || null,
            post.author || null,
            post.date || null,
            post.readTime || null,
            post.featured || false,
            post.image || null,
            JSON.stringify(post.tags || []),
            post.content || null,
            post.sourceDocumentName || null
        ]
    );

    await updateCategoryCounts();
    res.json({ success: true });
});

app.delete('/api/posts/:id', requireAdmin, async (req, res) => {
    await pool.query('DELETE FROM posts WHERE id = $1', [req.params.id]);
    await updateCategoryCounts();
    res.status(204).end();
});

app.get('/api/categories', async (req, res) => {
    const result = await pool.query('SELECT * FROM categories ORDER BY name ASC');
    res.json(result.rows);
});

app.post('/api/categories', requireAdmin, async (req, res) => {
    const category = req.body;
    if (!category || !category.id || !category.name) {
        return res.status(400).json({ error: 'Category id and name are required' });
    }
    await pool.query(
        `INSERT INTO categories (id, name, count)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, count = EXCLUDED.count;`,
        [category.id, category.name, category.count || 0]
    );
    res.json({ success: true });
});

app.post('/api/categories/update-counts', requireAdmin, async (req, res) => {
    await updateCategoryCounts();
    const result = await pool.query('SELECT * FROM categories ORDER BY name ASC');
    res.json(result.rows);
});

app.get('/api/settings/:key', async (req, res) => {
    const result = await pool.query('SELECT value FROM settings WHERE key = $1 LIMIT 1', [req.params.key]);
    if (!result.rows[0]) {
        return res.status(404).json({ error: 'Not found' });
    }
    res.json(result.rows[0].value);
});

app.post('/api/settings', requireAdmin, async (req, res) => {
    const { key, value } = req.body;
    if (!key) {
        return res.status(400).json({ error: 'Setting key is required' });
    }
    await pool.query(
        `INSERT INTO settings (key, value)
         VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`,
        [key, JSON.stringify(value)]
    );
    res.json({ success: true });
});

app.get('/api/data/export', async (req, res) => {
    const postsResult = await pool.query('SELECT * FROM posts ORDER BY date DESC NULLS LAST');
    const categoriesResult = await pool.query('SELECT * FROM categories ORDER BY name ASC');
    res.json({
        posts: postsResult.rows.map(normalizePost),
        categories: categoriesResult.rows
    });
});

app.post('/api/data/import', requireAdmin, async (req, res) => {
    const data = req.body;
    if (!data || !Array.isArray(data.posts) || !Array.isArray(data.categories)) {
        return res.status(400).json({ error: 'Import payload must contain posts and categories arrays' });
    }

    await pool.query('BEGIN');
    try {
        await pool.query('DELETE FROM posts');
        await pool.query('DELETE FROM categories');

        for (const category of data.categories) {
            await pool.query(
                `INSERT INTO categories (id, name, count) VALUES ($1, $2, $3)`,
                [category.id, category.name, category.count || 0]
            );
        }

        for (const post of data.posts) {
            await pool.query(
                `INSERT INTO posts (id, slug, title, excerpt, category, categoryLabel, author, date, readTime, featured, image, tags, content)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
                [
                    post.id,
                    post.slug,
                    post.title,
                    post.excerpt || null,
                    post.category || null,
                    post.categoryLabel || null,
                    post.author || null,
                    post.date || null,
                    post.readTime || null,
                    post.featured || false,
                    post.image || null,
                    JSON.stringify(post.tags || []),
                    post.content || null
                ]
            );
        }

        await updateCategoryCounts();
        await pool.query('COMMIT');
        res.json({ success: true });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Import failed:', error);
        res.status(500).json({ error: 'Import failed' });
    }
});

app.post('/api/data/clear', requireAdmin, async (req, res) => {
    await pool.query('DELETE FROM posts');
    await pool.query('DELETE FROM categories');
    res.status(204).end();
});

app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API route not found' });
    }
    next();
});

nextApp.prepare()
    .then(() => initDatabase())
    .catch((error) => {
        console.error('Database unavailable; serving local blog data:', error.message);
    })
    .finally(() => {
        app.use((req, res) => {
            if (req.path.startsWith('/api/')) {
                return res.status(404).json({ error: 'API route not found' });
            }

            return nextHandle(req, res);
        });

        app.listen(PORT, () => {
            console.log(`Server started on http://localhost:${PORT}`);
        });
    });
