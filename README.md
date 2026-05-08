# Client Portal — Content Approval Dashboard

A full-stack content approval portal for digital marketing agencies and their clients.

## Features

### Admin (Marketing Team)
- Secure login with JWT auth
- Create and manage clients with unique private approval links
- Create content approval tasks with images and captions
- Assign tasks to clients
- View all task statuses, comments, and activity
- Regenerate private links if needed

### Client (No Login Required)
- Opens a private URL — no account needed
- Sees a Kanban board: **For Review / Approved / For Revision**
- Can **approve** a task in one click from the card
- Can **request revisions** inline with a short note
- Can add comments and view the full comment thread
- Can click images for a full-screen preview
- Filters to quickly navigate between statuses

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Set up environment variables
Create a `.env.local` file (already included):
```
JWT_SECRET=change-this-to-a-long-random-secret-in-production
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

> ⚠️ **Important**: Change `JWT_SECRET` to a strong random string before deploying to production.

### 3. Start the development server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Default admin credentials
```
Email:    admin@portal.com
Password: Admin1234!
```

> The default admin is auto-created on first startup. Change the password in production.

## Routes

| Route | Description |
|-------|-------------|
| `/` | Home (redirects to admin login) |
| `/admin/login` | Admin login page |
| `/dashboard` | Admin dashboard with stats |
| `/clients` | Admin client management |
| `/tasks` | Admin task management |
| `/approve/[token]` | Client approval board (no login) |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Database | SQLite (via `better-sqlite3`) |
| Auth | JWT (stored in httpOnly cookie) |
| Passwords | bcryptjs |
| Tokens | nanoid (32-char random tokens) |
| Styling | Vanilla CSS Modules |
| Language | TypeScript |

## Database

The SQLite database is automatically created at `data/portal.db` on first run. No setup required.

## Data Models

- **AdminUsers** — Admin accounts with hashed passwords
- **Clients** — Client records with secure private tokens
- **Tasks** — Content items (image URL, caption, status)
- **Comments** — Client comments on tasks
- **ActivityLog** — Status changes and comment events

## Security

- Admin routes are protected by JWT cookie auth
- Private client links use 32-character random tokens (nanoid)
- Public client API routes only expose data matching the token
- Admin data is never returned to public client endpoints
- Comment input is sanitized and length-limited
- Passwords are hashed with bcryptjs (12 rounds)

## Production Deployment

1. Set `JWT_SECRET` to a strong random value
2. Set `NEXT_PUBLIC_APP_URL` to your domain
3. Run `npm run build && npm start`
4. Persist the `data/` directory (contains your SQLite DB)

---

Built with Next.js 14 · SQLite · TypeScript
