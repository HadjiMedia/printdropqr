# PrintDrop

PrintDrop is a QR-code print-order dispatch app for local print shops. Customers can submit a print request without creating an account; staff use a protected, live-updating queue to retrieve files and move jobs through Waiting, Printing, Done, and Cancelled.

## Deployment and dependency troubleshooting

The application targets **Next.js 15.5.27**, **Node.js 22.x**, and **npm**. See [DEPLOYMENT.md](./DEPLOYMENT.md) for the inspected dependency versions, exact clean-install/build commands, npm script-policy guidance, Vercel settings, and the commit/push checklist. Always commit `package.json` and `package-lock.json` together.

## Stack and data model

- Next.js App Router, React, TypeScript, Tailwind CSS, Lucide, and Framer Motion
- PostgreSQL with Drizzle ORM (this repository is configured for Drizzle rather than Prisma)
- Private local filesystem storage for development, or a private S3-compatible bucket for production
- Five-second dashboard/status polling, HMAC-signed staff sessions, and an authenticated retention endpoint

`src/db/schema.ts` defines `shops` and `print_jobs`, including the `job_status`, `paper_size`, and `color_type` PostgreSQL enums. `shop_id` is a cascading foreign key, queue numbers are allocated atomically per shop, and `expires_at` is indexed for retention cleanup. `file_url` stores a private storage reference (`local:...` or `s3:...`), not a public URL.

## Local setup

1. Install Node.js 22.x (or run `nvm install` and `nvm use` with the included `.nvmrc`) and run PostgreSQL. Create a database (the default local URL is `postgresql://postgres:postgres@127.0.0.1:5432/app_db`).
2. Copy `.env.example` to `.env`, then set `DATABASE_URL`, a strong `ADMIN_PASSWORD`, and a unique `SESSION_SECRET` with at least 32 characters. Set a separate random `CRON_SECRET`. For example, generate secrets with `openssl rand -base64 48`.
3. Install the committed dependencies with `npm ci --include=dev`.
4. Create/update the database tables with `npx drizzle-kit push`.
5. Start the app with `npm run dev` and open `http://localhost:3000`. The home page provisions the configured starter shop on first visit. The sample customer order page is `/sunbeam-print` (or the slug in `DEFAULT_SHOP_SLUG`).
6. Open `/admin/login` and sign in with `ADMIN_PASSWORD`. The dashboard supports multiple shops; use **Add shop** to create more tenant-isolated order pages.

The staff dashboard is deliberately disabled until both `ADMIN_PASSWORD` and a sufficiently long `SESSION_SECRET` are configured. Staff sessions are HTTP-only, SameSite cookies with a 12-hour expiration. All staff API endpoints and file downloads verify that session.

## Vercel deployment and DATABASE_URL

### Why the build is safe without database credentials

Next.js imports route modules while collecting build metadata, even when a route is dynamic. `src/db/index.ts` therefore exports lazy `db` and `pool` proxies: neither a PostgreSQL pool nor a Drizzle client is created during module import. Credentials are read and checked inside `getPool()` on first use, and both clients are cached across warm requests and development module reloads. Existing `import { db } from "@/db"` calls continue to work.

All database-backed pages and API handlers declare `dynamic = "force-dynamic"`. The status-update route at `/api/admin/jobs/[jobId]` also explicitly selects the Node.js runtime and returns a controlled 503 if runtime database configuration is missing. Other existing request error handlers remain in place. Missing credentials are not replaced with a dummy database or silently treated as successful requests.

`drizzle.config.ts` can also be loaded without credentials. Drizzle Kit requires a real `DATABASE_URL` for commands that connect to PostgreSQL, such as `push`, but not merely to load configuration or generate migration files. Run schema changes as a separate, authorized deployment step; do not add migrations or database queries to `npm run build`.

### Configure Vercel step by step

1. Sign in at **vercel.com/dashboard**, select the correct team, and open the **PrintDrop project** (not the team-level settings).
2. Open **Settings > Environment Variables**. Depending on the dashboard layout, **Environment Variables** may also appear directly in the project sidebar.
3. Click **Add Environment Variable** (or use **Add New**). Enter the exact name **`DATABASE_URL`**. Do not use `NEXT_PUBLIC_DATABASE_URL`, since database credentials must remain server-only.
4. Paste the full PostgreSQL connection string from your database provider into **Value**, without enclosing quotes or a leading `DATABASE_URL=`. Use the provider's recommended pooled endpoint for serverless deployments, with its required TLS/SSL parameters. A URL pointing to `localhost` or `127.0.0.1` cannot reach your local computer from Vercel.
5. Configure **all three environment scopes**, preferably using separate databases:
   - **Production:** add the production database URL and select **Production**.
   - **Preview:** add the preview/test database URL and select **Preview**. Apply it to all preview branches unless a specific branch intentionally has its own value; check existing branch overrides too.
   - **Development:** add your development database URL and select **Development**.
   If you intentionally use one database for all environments, you can select all three checkboxes for a single value, but isolated databases are safer.
6. Click **Save** for each entry. Confirm that `DATABASE_URL` appears for Production, Preview, and Development. Configure the other required server secrets from `.env.example`, particularly `ADMIN_PASSWORD`, `SESSION_SECRET`, and `CRON_SECRET`.
7. Commit and push the updated source. In the project's **Deployments** tab, open the relevant deployment's **...** menu and choose **Redeploy**, or deploy the new commit. Redeploy production and any previews that need the new settings. Existing deployments do not acquire environment-variable changes automatically.
8. Apply the Drizzle schema to each target database from a trusted environment with the corresponding `DATABASE_URL` before accepting orders. Use `npx drizzle-kit push` for initial setup; no schema change is needed solely for this lazy-initialization fix.
9. Open the new deployment's `/api/health` endpoint and confirm it returns `{"ok":true}`. Then open a shop page and test the staff dashboard. A successful build alone does not verify runtime credentials, database connectivity, or the presence of tables.

For local development with Vercel CLI, link the project and use `vercel env pull .env` to retrieve the **Development** variables for both Next.js and Drizzle Kit; back up any existing local `.env` first. Keep the file out of version control. You can alternatively copy `.env.example` and fill in the values yourself. No secret belongs in `next.config.ts`'s `env` setting or in `vercel.json`. The existing Next.js server configuration and cron schedule do not need to change for this fix. Vercel project environment variables are available to both builds and server-side function execution.

### Regression checks

- `node --test tests/database-build-safety.test.mjs` checks import-time safety without credentials, lazy initialization, method binding, singleton reuse, and dynamic route exports without opening network connections.
- On macOS/Linux, `DATABASE_URL='' npm run build` deliberately masks values in `.env` and verifies that compilation/page-data collection does not require database configuration. Do not leave the URL empty in the runtime environment.
- Normal validation: `npx next typegen`, `npm exec tsc -- --noEmit --pretty false`, then `npm run build`.

Vercel reference: https://vercel.com/docs/environment-variables/managing-environment-variables

## File storage

Without `S3_BUCKET`, uploaded files are stored privately outside the web root in the operating system temp directory under `printdrop-uploads`. Set `PRINTDROP_STORAGE_DIR` to choose a persistent private directory for a single-node deployment. Do not mount this directory under `public/` or expose it from a static file server.

For a horizontally scaled/serverless production deployment, configure a private S3-compatible bucket using `S3_BUCKET` and `S3_REGION`; optionally configure `S3_ENDPOINT` for a compatible provider and provide `S3_ACCESS_KEY_ID` plus `S3_SECRET_ACCESS_KEY` (or use the runtime IAM role). The app writes encrypted objects, never exposes bucket URLs, and streams downloads through an authenticated route. Grant the app only the required `PutObject`, `GetObject`, and `DeleteObject` permissions for the upload prefix. Configure bucket lifecycle rules as a second line of defense if your provider supports them.

Uploads accept PDF, DOCX, PNG, JPG, and JPEG files, enforce a 50 MiB maximum, validate extension/MIME and file signatures, and generate storage keys independently from customer filenames. Do not lower proxy/request-body limits below the supported upload size. The app uses Node.js route handlers for file streaming and the cron task.

## Retention schedule

`GET` and `POST /api/cron/purge` remove expired storage objects and then delete their database records. Jobs expire 24 hours after creation. Failed object deletions are logged and left in the database for the next sweep. The endpoint requires `Authorization: Bearer $CRON_SECRET` and returns counts for monitoring.

A Vercel schedule is included in `vercel.json` (hourly at minute 15); configure the same `CRON_SECRET` in the deployment environment. For another scheduler, call the endpoint hourly, for example:

```sh
curl --fail-with-body -H "Authorization: Bearer ${CRON_SECRET}" https://your-domain.example/api/cron/purge
```

Also retain a storage-provider lifecycle policy for the upload prefix when available. The cron route processes up to 250 expired jobs per call; invoke it again if a backlog remains.

## Routes

- `GET /[shopSlug]` — customer upload form
- `GET /[shopSlug]/status/[jobId]` — live customer status page
- `GET /admin/login` and `GET /admin/dashboard` — staff sign-in and queue
- `POST /api/jobs` — validated customer upload and job creation
- `GET /api/jobs/[jobId]` — public-safe status response (no file storage reference)
- `GET /api/jobs/[jobId]/download` — staff-authenticated private file stream
- `GET /api/admin/jobs?shop=[slug]`, `PATCH /api/admin/jobs/[jobId]`, and `/api/admin/shops` — authenticated staff operations
- `GET /api/qr-code?shop=[slug]` — shop-specific SVG QR code
- `GET /api/cron/purge` — authenticated retention sweep
- `GET /api/health` — platform health check

For QR links using the root query form (`/?shop=STORE_ID`), PrintDrop redirects known shop slugs or UUIDs to `/{shopSlug}`. QR codes point directly to the shop path.

## Production checklist

- Use HTTPS and set `NEXT_PUBLIC_APP_URL` to the canonical origin so printed QR codes do not depend on a proxy hostname.
- Use a distinct, high-entropy `SESSION_SECRET`, `CRON_SECRET`, and staff password; never commit `.env`.
- Configure S3-compatible private storage and least-privilege IAM for multi-instance deployments.
- Schedule the purge route and monitor its `failed` count and server logs.
- Set sensible reverse-proxy request size and timeout limits for 50 MiB multipart uploads.
- Add per-shop staff identity/roles, billing, audit logging, and rate limiting before opening a public multi-tenant SaaS.
