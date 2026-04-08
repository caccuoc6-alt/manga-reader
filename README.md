# MangaVault — Full-Stack Manga Reading Website

A complete, self-hosted manga reading platform built with Node.js, Express, MongoDB, and vanilla JavaScript.

---

## 🚀 Quick Start

### Prerequisites

| Tool | Version | Download |
|------|---------|----------|
| Node.js | v18+ | https://nodejs.org |
| MongoDB | v6+ (Community) | https://www.mongodb.com/try/download/community |

---

## 📦 Installation

### Step 1 — Install Node.js
Download and install Node.js from https://nodejs.org (LTS version recommended).

Verify installation:
```bash
node -v   # should print v18.x.x or higher
npm -v
```

### Step 2 — Install MongoDB

**Windows:**
1. Download MongoDB Community Server from https://www.mongodb.com/try/download/community
2. Run the installer (choose "Complete" setup)
3. MongoDB runs as a Windows Service automatically after install

**Start MongoDB manually (if needed):**
```bash
mongod --dbpath="C:\data\db"
```
> Create the folder first: `mkdir C:\data\db`

### Step 3 — Install Project Dependencies

Open a terminal inside the `manga-reader/` folder:
```bash
npm install
```

This installs:
- `express` — web server framework
- `mongoose` — MongoDB ODM
- `bcryptjs` — password hashing
- `multer` — file upload handling
- `express-session` — session management
- `connect-mongo` — store sessions in MongoDB
- `cors` — cross-origin resource sharing

### Step 4 — Start the Server

```bash
npm start
```

Or for development with auto-restart:
```bash
npm run dev
```

### Step 5 — Open the App

Visit: **http://localhost:3000**

---

## 🗂 Project Structure

```
manga-reader/
├── server.js               ← Express entry point
├── package.json
├── middleware/
│   └── auth.js             ← Session auth guards
├── models/
│   ├── User.js             ← Mongoose User schema
│   └── Manga.js            ← Mongoose Manga schema (with chapters)
├── routes/
│   ├── auth.js             ← /api/auth/* endpoints
│   └── manga.js            ← /api/manga/* endpoints
├── uploads/                ← Uploaded images stored here
│   ├── <cover>.jpg
│   └── <manga-id>/
│       └── chapter-1/
│           └── <page>.jpg
└── public/                 ← Frontend files
    ├── index.html          ← Homepage / Library
    ├── login.html          ← Login page
    ├── register.html       ← Registration page
    ├── upload.html         ← Manga upload page
    ├── reader.html         ← Manga reader
    ├── css/
    │   └── style.css       ← Global design system
    └── js/
        └── api.js          ← Shared frontend utilities
```

---

## 🔌 API Reference

### Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | Public | Create account |
| POST | `/api/auth/login` | Public | Sign in |
| POST | `/api/auth/logout` | Public | Sign out |
| GET  | `/api/auth/me` | 🔒 Required | Get current user |

**Register body:**
```json
{ "username": "john", "email": "john@example.com", "password": "secret123" }
```

### Manga

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET    | `/api/manga` | Public | List all manga (search, filter, paginate) |
| GET    | `/api/manga/:id` | Public | Get manga detail + chapters |
| POST   | `/api/manga` | 🔒 Required | Upload new manga |
| POST   | `/api/manga/:id/chapter` | 🔒 Owner/Admin | Add chapter |
| DELETE | `/api/manga/:id` | 🔒 Owner/Admin | Delete manga |
| POST   | `/api/manga/:id/rate` | 🔒 Required | Rate manga (1–5) |

**GET /api/manga query params:**
- `search` — full-text search
- `genre` — filter by genre
- `status` — ongoing / completed / hiatus
- `page` — page number (default 1)
- `limit` — results per page (default 12)

**POST /api/manga (multipart/form-data):**
- `title` (required)
- `description`
- `author`
- `genres` — comma-separated or multiple values
- `status` — ongoing / completed / hiatus
- `cover` — cover image file
- `pages` — multiple page image files
- `chapterNumber`
- `chapterTitle`

---

## 👤 User Roles

| Role | Permissions |
|------|------------|
| **Admin** | Upload manga, add chapters, delete any manga |
| **User** | Upload manga, add chapters to own manga, rate, read |
| **Guest** | Browse library, read manga |

> **The first registered account automatically becomes Admin.**

---

## ✨ Features

### Core
- ✅ Register / Login / Logout with session persistence
- ✅ Bcrypt password hashing (salt rounds: 12)
- ✅ Upload manga with cover image and chapter pages
- ✅ Multi-chapter management
- ✅ Vertical scrolling manga reader
- ✅ Lazy-loaded images via IntersectionObserver
- ✅ Reading progress bar
- ✅ Delete manga (owner or admin)

### UI/UX
- ✅ Dark manga-style theme with purple/pink gradient accents
- ✅ Responsive design (mobile-friendly)
- ✅ Toast notifications
- ✅ Password strength meter
- ✅ Drag-and-drop file upload zones
- ✅ Page preview thumbnails before upload
- ✅ Skeleton loading states

### Discovery
- ✅ Full-text search (title, description, author)
- ✅ Genre chip filters (Action, Romance, Fantasy, etc.)
- ✅ Status filter (Ongoing / Completed / Hiatus)
- ✅ Sort by: Newest / Most Viewed / A→Z
- ✅ Pagination

### Reader
- ✅ Chapter select dropdown + sidebar
- ✅ Keyboard navigation (← → arrow keys)
- ✅ Reader width & gap settings (saved to localStorage)
- ✅ Previous/Next chapter FAB buttons
- ✅ Star rating widget
- ✅ View count tracking
- ✅ End-of-chapter navigation panel

---

## 🔧 Configuration

Edit `server.js` to change these defaults:

```js
const PORT      = process.env.PORT      || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/mangadb';
```

Set via environment variables:
```bash
PORT=8080 MONGO_URI=mongodb://localhost:27017/mydb node server.js
```

---

## 🛠 Troubleshooting

| Problem | Fix |
|---------|-----|
| `ECONNREFUSED` on start | MongoDB is not running. Start it first. |
| `Port 3000 in use` | Change PORT or kill the process using it |
| Images not loading | Check `uploads/` folder permissions |
| Session not persisting | Clear browser cookies/storage |
| Upload fails | Check file size (10MB limit per file) |

---

## 📄 License

MIT — free to use and modify for personal or commercial projects.
