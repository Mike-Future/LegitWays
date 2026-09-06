# CarnegienFreedom Website Documentation

**Document version:** 1.0  
**Last reviewed:** September 3, 2026  
**Project:** LegitWays / CarnegienFreedom

## 1. Purpose

CarnegienFreedom is an education-first website about safer opportunities, scam awareness, practical learning, and informed decision-making. The public site is a set of HTML pages enhanced with vanilla JavaScript. The blog is served through an Express API backed by PostgreSQL, with a local JSON fallback for public read operations when the database is unavailable.

This document is the operational reference for development, deployment, content management, security, and maintenance.

## 2. Technology Stack

- Node.js and Express 4
- PostgreSQL 16 for persistent blog content
- Vanilla JavaScript and CSS
- Helmet for HTTP security headers
- CORS with an explicit origin allowlist
- `express-rate-limit` for authentication throttling
- Docker Compose for local PostgreSQL
- Render deployment configuration in `render.yaml`

No frontend framework or build step is required. The browser loads the HTML, CSS, and JavaScript files directly.

## 3. Site Structure

| Path                       | Purpose                                                      |
| -------------------------- | ------------------------------------------------------------ |
| `index.html`               | Main landing page, direct guide download, cookie consent UI  |
| `about.html`               | Team profiles and organization information                   |
| `blog.html`                | Blog listing, category filters, search, and featured content |
| `blog-post.html`           | Dynamic article page selected by `?slug=...`                 |
| `contact.html`             | Contact page                                                 |
| `scam-awareness.html`      | Scam education resource                                      |
| `success-stories.html`     | Success stories resource                                     |
| `core-values.html`         | Core values                                                  |
| `privacy-policy.html`      | Privacy and data handling policy                             |
| `cookie-policy.html`       | Cookie categories, consent, and management guidance          |
| `terms-of-use.html`        | Website usage terms                                          |
| `disclaimer.html`          | General site disclaimer                                      |
| `earnings-disclaimer.html` | Earnings and results disclaimer                              |
| `admin.html`               | Protected blog administration interface                      |

### Important directories

- `scripts/`: browser behavior, API client, blog rendering, and admin operations
- `styles/`: shared, informational, blog, and admin stylesheets
- `data/blog-data.json`: seed and local fallback data
- `assets/`: downloadable guide and other static assets
- `images/`: logos and site imagery
- `server.js`: Express server, API routes, database initialization, security middleware
- `docker-compose.yml`: local PostgreSQL service
- `render.yaml`: Render web-service configuration

## 4. Local Development

### Prerequisites

- Node.js 18 or newer
- npm
- Docker Desktop, if using the local PostgreSQL database

### Install dependencies

```bash
npm install
```

### Start PostgreSQL

```bash
npm run db:start
```

The local database is exposed on port `5432` with these Docker Compose defaults:

- Database: `legitways`
- User: `legitways`
- Password: `legitways_local_password`

### Configure environment variables

Create a local `.env` file. Do not commit it.

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgres://legitways:legitways_local_password@localhost:5432/legitways
DB_SSL=false
ALLOWED_ORIGINS=http://localhost:3000

ADMIN_BOOTSTRAP_USERNAME=admin
ADMIN_BOOTSTRAP_EMAIL=admin@example.com
ADMIN_BOOTSTRAP_PASSWORD=replace-with-a-long-password

```

The admin bootstrap variables are used only when the database has no admin users. Use a unique password and keep all credentials in the environment, never in HTML or JavaScript.

### Start the server

```bash
npm start
```

Open `http://localhost:3000/` in a browser. The server initializes its tables on startup. If the database is unavailable, public blog reads fall back to `data/blog-data.json`; publishing and other admin write operations require PostgreSQL.

### Stop PostgreSQL

```bash
npm run db:stop
```

## 5. Deployment

The project is configured for a Node web service on Render:

1. Create a PostgreSQL database.
2. Create a Render web service from the repository.
3. Use `npm install` as the build command and `npm start` as the start command.
4. Set `DATABASE_URL` to the managed database connection string.
5. Set `DB_SSL=true` for the hosted database.
6. Set `NODE_ENV=production`.
7. Set `ALLOWED_ORIGINS` to a comma-separated list of trusted browser origins, for example `https://carnegienfreedom.com,https://www.carnegienfreedom.com`.
8. Set strong admin bootstrap credentials only for first-time initialization, then remove or rotate them according to the hosting provider's secret-management process.

The server listens on the `PORT` supplied by Render. Do not hard-code a production port.

## 6. Blog Content Management

### Admin workflow

1. Open `/admin.html`.
2. Log in with an existing admin account.
3. Use **Add New Post** to create or update a post.
4. Provide a unique ID, URL slug, title, category, excerpt, author, date, reading time, image, tags, and HTML content.
5. Upload a `.docx` or `.txt` article document when using the document workflow.
6. Preview the content before publishing.
7. Use **Manage Posts** to edit or delete content.
8. Export data regularly before bulk imports or destructive changes.

Admin writes are authenticated by an HttpOnly, SameSite session cookie. In production the cookie also has the Secure attribute.

### Post shape

```json
{
  "id": "7",
  "slug": "how-to-evaluate-an-opportunity",
  "title": "How to Evaluate an Opportunity",
  "excerpt": "A short summary for cards and search results.",
  "category": "opportunities",
  "categoryLabel": "Opportunities",
  "author": "Author Name",
  "date": "2026-09-03",
  "readTime": "5 min read",
  "featured": false,
  "image": "https://images.unsplash.com/example?w=1200&q=80",
  "tags": ["research", "online safety"],
  "content": "<p>Article HTML content.</p>",
  "sourceDocumentName": null
}
```

### Content guidance

- Use a stable, lowercase, URL-safe slug.
- Keep excerpts concise and meaningful.
- Use semantic headings in article HTML.
- Avoid unsupported scripts or unsafe embedded markup in article content.
- Use accessible alternative text for meaningful images.
- Keep claims realistic and consistent with the site's educational disclaimers.
- Export a backup before imports, database clears, or large content changes.

## 7. API Reference

All API routes are under `/api`. JSON requests must use `Content-Type: application/json`. Admin routes require the session cookie created by login or registration.

### Health and public content

| Method | Route                           | Description                                                   |
| ------ | ------------------------------- | ------------------------------------------------------------- |
| `GET`  | `/api/health`                   | Returns `200` when the database is available, otherwise `503` |
| `GET`  | `/api/posts`                    | Returns all posts, newest first                               |
| `GET`  | `/api/posts/slug/:slug`         | Returns one post or `404`                                     |
| `GET`  | `/api/posts/category/:category` | Returns posts in a category                                   |
| `GET`  | `/api/posts/featured`           | Returns featured posts                                        |
| `GET`  | `/api/posts/search?q=term`      | Searches title, excerpt, category, and tags                   |
| `GET`  | `/api/categories`               | Returns categories                                            |
| `GET`  | `/api/settings/:key`            | Returns a public setting or `404`                             |
| `GET`  | `/api/data/export`              | Returns posts and categories for backup                       |

### Authentication

| Method | Route                | Description                               |
| ------ | -------------------- | ----------------------------------------- |
| `POST` | `/api/auth/register` | Creates the first or a new admin account  |
| `POST` | `/api/auth/login`    | Starts an admin session                   |
| `GET`  | `/api/auth/session`  | Checks the current session                |
| `POST` | `/api/auth/logout`   | Deletes the session and clears the cookie |

Authentication requests are rate-limited to 10 requests per 15 minutes per client address.

### Admin content operations

| Method   | Route                           | Description                                            |
| -------- | ------------------------------- | ------------------------------------------------------ |
| `POST`   | `/api/posts`                    | Creates or updates a post by ID                        |
| `DELETE` | `/api/posts/:id`                | Deletes a post                                         |
| `POST`   | `/api/categories`               | Creates or updates a category                          |
| `POST`   | `/api/categories/update-counts` | Recalculates category counts                           |
| `POST`   | `/api/settings`                 | Creates or updates a setting                           |
| `POST`   | `/api/data/import`              | Replaces posts and categories from a validated payload |
| `POST`   | `/api/data/clear`               | Deletes all posts and categories                       |

The educational guide is downloaded directly from the site and does not require an email address.

## 8. Security and Privacy

Current protections include:

- Helmet security headers
- Content Security Policy with allowlisted script, style, font, image, connection, form, object, and frame sources
- `X-Content-Type-Options: nosniff`
- Clickjacking protection through frame restrictions
- CORS deny-by-default behavior when `ALLOWED_ORIGINS` is configured
- Parameterized PostgreSQL queries
- Bcrypt password hashing
- Random session tokens stored as SHA-256 hashes in the database
- HttpOnly, SameSite session cookies
- Secure session cookies in production
- Rate limiting on authentication
- JSON request size limit of 1 MB
- Cookie consent stored locally under `legitways_cookie_consent`
- Separate cookie and privacy policies

The cookie banner supports necessary, analytics, and marketing choices. Analytics behavior must remain behind an affirmative analytics-consent check. Do not add analytics, advertising pixels, or other non-essential tracking without updating the policy and consent flow.

## 9. Accessibility and SEO Baseline

The site includes language declarations, responsive viewport metadata, page titles, descriptions, semantic sections, labels for interactive controls, reduced-motion handling, and keyboard-friendly buttons for the migrated navigation and admin controls.

Before publishing new content:

- Check heading order.
- Provide useful image `alt` text.
- Ensure links describe their destination.
- Test keyboard navigation and focus visibility.
- Test at narrow mobile widths.
- Confirm color contrast for new components.
- Run Lighthouse or an equivalent accessibility audit.

## 10. Maintenance Checklist

### Before deployment

- Run `npm install` or `npm ci`.
- Run `npm audit --omit=dev --audit-level=high`.
- Run `node --check server.js` and checks for changed browser scripts.
- Verify `ALLOWED_ORIGINS` contains only trusted production origins.
- Confirm SMTP and database credentials are stored as secrets.
- Confirm the guide PDF exists at `assets/legit-ways-guide.pdf`.
- Test login, logout, blog loading, direct guide download, and cookie preferences.

### Regularly

- Export blog data and store the backup securely.
- Review admin sessions and remove stale database records if necessary.
- Review dependency advisories.
- Test the privacy, cookie, terms, and disclaimer pages after content changes.
- Review third-party CDN dependencies and their integrity/security posture.
- Recheck accessibility and performance after visual changes.

## 11. Troubleshooting

### Blog shows local content instead of database content

Check `/api/health`, `DATABASE_URL`, database reachability, and `DB_SSL`. The public pages intentionally fall back to `data/blog-data.json` when the API is unavailable.

### Admin cannot log in

Confirm the database is available, the account exists, and the request is not rate-limited. Inspect the server logs for database errors. Do not disable authentication to work around the issue.

### Browser reports a CSP violation

Check whether a new inline script, inline event handler, external origin, or dynamically generated HTML was added. Prefer external JavaScript and allowlist only the specific trusted origin required.

## 12. Known Architecture Notes

- `BLOG_README.md` and `DYNAMIC_SYSTEM_README.md` contain historical notes from earlier iterations. This document reflects the current Express/PostgreSQL implementation.
- The application has no automated test suite configured in `package.json`; validation currently relies on syntax checks, dependency audits, diagnostics, and manual endpoint/browser testing.
- Legal pages describe the site's intended privacy and cookie practices. Obtain qualified legal advice before relying on them for a particular jurisdiction or regulated service.
