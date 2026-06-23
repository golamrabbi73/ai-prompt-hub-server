# Promptarium — Server

Backend REST API for **Promptarium**, an AI prompt sharing and marketplace platform. Built with Express.js and MongoDB, it handles authentication, prompt CRUD, reviews, bookmarks, reports, Stripe payments, role-based access control, and admin/creator analytics via MongoDB aggregation pipelines.

## Live Links

- **Client:** https://ai-prompt-hub-client.vercel.app
- **Server:** https://ai-prompt-hub-server-1.onrender.com
- **Client Repo:** https://github.com/golamrabbi73/ai-prompt-hub-client
- **Server Repo:** https://github.com/golamrabbi73/ai-prompt-hub-server

## Tech Stack

- **Runtime:** Node.js, Express.js
- **Database:** MongoDB (native driver, no Mongoose)
- **Auth:** Firebase Authentication (client) + JWT (server-side route protection)
- **Payments:** Stripe (Payment Intents API)
- **Hosting:** Render (server), Vercel (client)
- **Other:** CORS, dotenv

## Features

- Firebase + JWT based authentication with route-level protection
- Role-based access control — `User`, `Creator`, `Admin`
- Prompt CRUD with approval workflow (`pending` → `approved` / `rejected`)
- Free-tier limit — non-premium `User` role capped at 3 submitted prompts
- Premium subscription via Stripe — unlocks private/premium prompts
- Bookmarks (save/unsave), Reviews (CRUD), Reports (with admin "warn creator" action)
- Per-prompt analytics (copy count, bookmark count, review count, avg rating)
- Creator dashboard stats — prompt growth over time, top copied prompts
- Admin dashboard stats — site-wide totals, MongoDB aggregation breakdowns (by category, by status, top AI tools), revenue
- Search, filter (category / AI tool / difficulty), sort, and pagination on the public prompt feed

## Environment Variables

Create a `.env` file in the root with:

```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
STRIPE_SECRET_KEY=your_stripe_secret_key
```

## Getting Started

```bash
git clone https://github.com/golamrabbi73/ai-prompt-hub-server.git
cd ai-prompt-hub-server
npm install
npm run dev
```

Server runs on `http://localhost:5000` by default.

## Deployment Note

The server is hosted on Render's free tier, which spins down after periods of inactivity. The first request after idle time may take 30–50 seconds to respond while the instance wakes up.

## Auth Middleware

| Middleware | Purpose |
|---|---|
| `verifyToken` | Validates the JWT sent in the `Authorization: Bearer <token>` header. Attaches decoded payload to `req.decoded`. |
| `verifyAdmin` | Runs after `verifyToken`. Looks up the user by `req.decoded.email` and allows access only if `role === "Admin"`. |

## API Reference

### Auth
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/jwt` | Public | Issues a signed JWT for a logged-in Firebase user |

### Users
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/users` | Public | Creates a user (default role `User`, subscription `free`) if not already existing |
| GET | `/users/top-creators` | Public | Aggregates top 6 creators by approved prompt count |
| GET | `/users` | Admin | Lists all users |
| GET | `/users/:email` | Token | Fetches a single user by email |
| PATCH | `/users/:email/role` | Admin | Updates a user's role (`User` / `Creator` / `Admin`) |
| DELETE | `/users/:email` | Admin | Deletes a user |

### Prompts
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/prompts` | Token | Creates a prompt with `status: "pending"`. Free `User` role limited to 3 prompts. |
| GET | `/prompts/featured` | Public | Top 6 approved/public prompts sorted by copy count |
| GET | `/prompts` | Public | Paginated, searchable, filterable, sortable list of approved prompts |
| GET | `/prompts/admin/all` | Admin | All prompts regardless of status |
| DELETE | `/prompts/admin/:id` | Admin | Admin-level prompt deletion |
| GET | `/prompts/user/:email` | Token | All prompts by a specific creator (any status) |
| PATCH | `/prompts/:id/copy` | Token | Increments a prompt's copy count |
| PATCH | `/prompts/:id/status` | Admin | Approves/rejects a prompt, optional `feedback` on rejection |
| PATCH | `/prompts/:id/feature` | Admin | Toggles a prompt's `featured` flag |
| GET | `/prompts/:id/analytics` | Token | Copy count, bookmark count, review count, avg rating for one prompt |
| GET | `/prompts/:id` | Public | Fetches a single prompt |
| PUT | `/prompts/:id` | Token | Updates a prompt (resets to `pending` on the client side after edit) |
| DELETE | `/prompts/:id` | Token | Deletes a prompt (creator-owned) |

### Reviews
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/reviews` | Token | Adds a review |
| GET | `/reviews/latest` | Public | Latest 6 reviews (for homepage) |
| GET | `/reviews/user/:email` | Token | All reviews by a user, with prompt title attached |
| GET | `/reviews/:promptId` | Public | All reviews for a specific prompt |
| DELETE | `/reviews/:id` | Token | Deletes a review |

### Bookmarks
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/bookmarks` | Token | Toggles a bookmark on/off |
| GET | `/bookmarks/check/:email/:promptId` | Token | Checks if a prompt is bookmarked by a user |
| GET | `/bookmarks/full/:email` | Token | Bookmarked prompts with full prompt details |
| GET | `/bookmarks/:email` | Token | Raw bookmark records for a user |

### Reports
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/reports` | Token | Submits a report against a prompt |
| GET | `/reports` | Admin | Lists all reports |
| PATCH | `/reports/:id` | Admin | Updates report status |
| POST | `/reports/:id/warn` | Admin | Marks report as `warned` and increments the creator's `warningCount` |

### Payments
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/create-payment-intent` | Public | Creates a Stripe Payment Intent for the given `price` |
| POST | `/payments` | Token | Records a payment and upgrades the user to `premium` |
| GET | `/payments` | Admin | Lists all payments |
| GET | `/payments/:email` | Token | Payment history for one user |

### Analytics
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/analytics/stats` | Public | Site-wide totals for the homepage stats section |
| GET | `/creator/stats/:email` | Token | Per-creator stats: totals, prompt growth by month, top-copied prompts |
| GET | `/analytics/admin` | Admin | Full admin dashboard data via aggregation — revenue, prompts by category/status, top AI tools, totals |

## Database Collections

`users`, `prompts`, `reviews`, `bookmarks`, `reports`, `payments` — all under the `promptariumDB` database.

## Security Notes

- All database credentials and secrets live in `.env` (never committed).
- Route-level protection via `verifyToken` / `verifyAdmin` middleware on any endpoint that exposes or mutates user, prompt-ownership, or financial data.
- Stripe secret key is server-side only; the publishable key lives in the client's `.env`.