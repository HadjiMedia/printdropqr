# PrintDrop: reproducible Next.js 15.5.27 deployment

## Diagnosis

The fatal errors in the reported build are unresolved production packages: `qrcode`, `pg`, and `@aws-sdk/client-s3`. Install-script warnings for esbuild/sharp are a separate issue; they cannot supply those missing packages or fix an incorrect manifest/root directory.

Before this repair, all three packages were already present in this workspace's `dependencies`, installed successfully, and matched `package-lock.json`. This workspace declared Next.js **16.2.6**, whereas the supplied Vercel log reported **15.5.27**. That discrepancy means the failing deployed dependency tree is not the one that was inspected here. The exact remote cause (different commit, root directory, manifest, or install override) cannot be established without the Vercel project settings and deployment source. This workspace does not include Git metadata, so the tracked files in the remote repository cannot be confirmed here.

The repaired project explicitly targets **Next.js 15.5.27** and preserves QR generation, PostgreSQL/Drizzle, S3/local storage, private downloads, and retention cleanup. No modules are stubbed out, hidden from webpack, or replaced by browser fallbacks.

## Runtime and dependencies

Use **Node.js 22.x**, with npm. The repair was exercised on Node **22.23.2** and npm **10.9.8**. `.nvmrc` selects Node 22 for local tools; also select Node 22.x in Vercel, since `.nvmrc` alone does not configure Vercel's runtime.

| Direct production dependency | Exact version | Declared Node requirement | Usage |
| --- | --- | --- | --- |
| `next` | `15.5.27` | `^18.18.0 || ^19.8.0 || >=20.0.0` | App Router and production build |
| `qrcode` | `1.5.4` | `>=10.13.0` | Shop QR SVG route |
| `pg` | `8.20.0` | `>=16.0.0` | PostgreSQL pool used by Drizzle |
| `@aws-sdk/client-s3` | `3.1146.0` | `>=20.0.0` | Private object upload/download/purge |
| `server-only` | `0.0.1` | No declared restriction | Protect backend module boundaries |

React and React DOM remain at **19.2.6**, which satisfy Next.js 15.5.27's React `^19.0.0` peer dependency. `eslint-config-next` is aligned to **15.5.27**, and `@eslint/eslintrc` is declared directly for the legacy-to-flat config adapter. Type declarations are already present. The three failing runtime packages are not dev-only or merely transitive dependencies.

Only **`package-lock.json`** is used. Keep it committed together with `package.json`; do not create yarn, pnpm, or Bun lockfiles. `.npmrc` sets `save-exact=true` for subsequent explicit dependency changes. Never delete the lockfile to hide an npm consistency error.

## Exact local commands

Run from the directory containing this application's `package.json` and `package-lock.json`. If using nvm:

```sh
nvm install
nvm use
node --version
npm --version
```

After pulling the repaired files, the dependency changes are already committed in the manifest/lockfile. Verify using a clean install:

```sh
npm ci --include=dev
npm ls --depth=0 next qrcode pg @aws-sdk/client-s3
node --test tests/*.test.mjs
npm run lint
npx next typegen
npm exec tsc -- --noEmit --pretty false
npm run build
```

If the local checkout still has the old manifest and you are reproducing the dependency repair manually, these are the exact npm commands (also apply the source/configuration changes listed below):

```sh
npm install --save-exact next@15.5.27 qrcode@1.5.4 pg@8.20.0 @aws-sdk/client-s3@3.1146.0 server-only@0.0.1 @eslint/eslintrc@3.3.5
npm install --save-dev --save-exact eslint-config-next@15.5.27
```

Then run the clean-install and verification commands above. `npm ci` does not repair an out-of-sync manifest: npm must generate the updated lockfile, and both files must be committed.

After switching Next.js major versions, it is reasonable to remove only the generated `.next` directory before validation; do not remove the source, lockfile, or `.env`.

An optional build-safety check on macOS/Linux is `DATABASE_URL='' npm run build`. The empty process value deliberately masks `.env` and confirms the lazy database client is not initialized during build. Real runtime requests still require a configured database.

## What changed in source/configuration

- **`package.json` / `package-lock.json`:** npm-pinned runtime packages, Next.js 15.5.27 and matching lint config, plus explicit server-only and ESLint adapter dependencies.
- **`src/app/api/qr-code/route.ts`:** retains the correct `import QRCode from "qrcode"` with TypeScript `esModuleInterop`; explicitly exports both `dynamic = "force-dynamic"` and `runtime = "nodejs"`.
- **`src/db/index.ts`:** adds a `server-only` boundary; retains the lazy singleton `Pool`, request-time `DATABASE_URL` validation, and idle-connection error handler. `pg` must run on Node.js, not Edge. Use your provider's pooled PostgreSQL URL and required TLS options; do not disable certificate validation to hide connectivity failures.
- **`src/lib/storage.ts`:** adds a `server-only` boundary; retains named AWS SDK v3 imports (`S3Client`, `PutObjectCommand`, `GetObjectCommand`, `DeleteObjectCommand`) and lazy S3 configuration. Upload, download, and cron handlers already select the Node.js runtime.
- **`eslint.config.mjs`:** adapts Next.js 15's legacy shared ESLint config using `FlatCompat`; does not suppress lint/type failures.
- **`tsconfig.json`:** uses Next.js 15's `jsx: "preserve"`, retaining strict typing and `esModuleInterop`.
- **`src/app/page.tsx`, `src/components/admin-dashboard.tsx`, `src/components/customer-order-form.tsx`:** internal navigation uses Next.js `Link`; QR SVGs use unoptimized `Image` components. These resolve Next.js 15 lint issues without changing the print workflow.
- **`vercel.json`:** selects the Next.js framework, `npm ci --include=dev`, and `npm run build`; preserves the existing cron schedule and leaves output configuration automatic.
- **`.nvmrc`, `.npmrc`, `.gitignore`:** document the runtime choice, pin subsequent dependency additions, ignore generated output/secrets, and leave the lockfile trackable.
- **`tests/database-build-safety.test.mjs`, `tests/deployment-dependencies.test.mjs`:** cover import-time safety, manifest/lockfile consistency, production package resolution, QR generation, server boundaries, S3/pg APIs, and native build tools without using live credentials.

`next.config.ts` remains unchanged. Its default server deployment is correct. Do not add `output: "export"`, fake aliases, client polyfills for Node modules, webpack fallbacks that disable pg/S3, or `ignoreBuildErrors` to make this build appear successful. Server-only imports fail clearly if a future client component accidentally imports a backend helper.

## esbuild and sharp install-script warnings

The shown warnings are **not** the cause of the three `Module not found` errors. esbuild is used by the Drizzle development tooling; sharp is Next.js's optional native image dependency. They are unrelated to installing `pg`, `qrcode`, or the S3 SDK.

npm's script policy varies by version. Some npm versions warn while still allowing scripts; newer policies may skip unapproved scripts or make them a fatal install error when strict enforcement is enabled. The tested npm 10.9.8 environment has no `npm install-scripts` command. Its clean installation and the included native-tool smoke tests determine whether these tools work here; do not assume the same script policy on a different npm version.

On an npm version that exposes the command from your log, review the actual locked versions and their scripts first:

```sh
npm --version
npm install-scripts ls
npm ls esbuild sharp --all
```

Only if you have reviewed and trust those scripts and the installation policy requires approval, approve the named packages (not every package globally), then rebuild and re-test:

```sh
npm install-scripts approve esbuild sharp
npm rebuild esbuild sharp
node --test tests/deployment-dependencies.test.mjs
```

The approval command normally records version-scoped `allowScripts` entries in `package.json`; commit those entries and any npm-generated lockfile changes if you take this optional step. Review again when native dependency versions change. Do not blindly use `approve --all`, disable all safeguards, or install the old esbuild version from a stale log.

If native smoke tests pass and install/build exit successfully, these warnings do not block this deployment. If a stricter policy blocks binaries and the smoke tests fail, approvals are a separate required repair. npm audit/deprecation reports are also separate from module resolution: review them independently rather than applying `npm audit fix --force` and changing the target framework unintentionally.

## Vercel project settings

1. **Source:** open the failed deployment and verify its Git repository, branch, and commit SHA. The next deployment must contain the repaired `package.json` **and** `package-lock.json`; editing uncommitted local dependencies is insufficient.
2. **Root Directory:** in **Project > Settings > Build and Deployment**, select the directory containing these two files and `src/app`. For this single-app repository, use the repository root. Do not point Vercel to a parent/child directory with a different manifest.
3. **Framework Preset:** select **Next.js**.
4. **Node.js Version:** select **22.x**. If your external repository has an `engines.node` constraint, ensure it also permits Node 22; a conflicting engines field must not silently select another runtime.
5. **Install Command:** `npm ci --include=dev`. This is also recorded in `vercel.json`. Do not replace it with a global install, `npx next@...`, a different package manager, or a production-only/pruned installation before building. Build-time TypeScript, Tailwind and lint dependencies are needed.
6. **Build Command:** `npm run build`, using the local Next.js binary from this project.
7. **Output Directory:** leave the Next.js default/automatic setting. Remove custom `out`/`public` overrides; this app needs server functions and is not a static export.
8. **Environment Variables:** configure `DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `CRON_SECRET`, and the appropriate private S3 values for each relevant **Production**, **Preview**, and **Development** scope. Set `NEXT_PUBLIC_APP_URL` to the desired public origin for QR codes. Never give database/S3 secrets a `NEXT_PUBLIC_` prefix. See `.env.example` and the detailed Vercel instructions in `README.md`.
9. **Redeploy:** deploy the pushed commit. For this repair, clear/disable the existing build cache for the redeploy once so an old installation is not reused. Clearing cache alone cannot fix the wrong root or missing committed dependencies.
10. **Verify:** the build banner should show **Next.js 15.5.27** and the install step should be npm. After deployment, check `/api/health`, open the starter shop page, and load `/api/qr-code?shop=sunbeam-print` (or your configured shop slug). Health verifies connectivity; the shop/QR pages also verify schema and route behavior.

Runtime infrastructure is still required: apply the existing Drizzle schema to your hosted database, use private S3 rather than temporary local files for durable Vercel uploads, and configure an authorized retention scheduler. The existing hourly Vercel cron needs a plan supporting that frequency; that is independent of npm compilation. Large 50 MiB uploads also need a direct-to-object-storage upload flow or a hosting/proxy path that supports that size, because Vercel Function body-size limits cannot be raised by installing these packages. This repair does not redesign the upload transport.

## Exactly what to commit and push

From the application/repository root, after validation:

```sh
git add package.json package-lock.json .npmrc .nvmrc .gitignore vercel.json eslint.config.mjs tsconfig.json
git add src/db/index.ts src/lib/storage.ts src/app/api/qr-code/route.ts
git add src/app/page.tsx src/components/admin-dashboard.tsx src/components/customer-order-form.tsx
git add tests/database-build-safety.test.mjs tests/deployment-dependencies.test.mjs README.md DEPLOYMENT.md
git diff --cached --stat
git diff --cached -- package.json package-lock.json
git commit -m "Fix reproducible Next.js 15 Vercel dependency build"
git push
```

Review the staged changes before committing, including any unrelated files already staged in your own checkout. Do not commit `.env`, credentials, `node_modules`, `.next`, or Vercel local project metadata. The lockfile is essential. If Git refuses to stage it, inspect the relevant ignore rule using `git check-ignore -v package-lock.json` and correct that rule; do not silently omit the file.

The Vercel dashboard and remote Git repository are outside this workspace. Saving these files here does not itself commit, push, change Vercel settings, or deploy the remote project.

## References

- https://nextjs.org/docs/messages/module-not-found
- https://nextjs.org/docs/15/app/api-reference/config/eslint
- https://docs.npmjs.com/cli/v11/commands/npm-install-scripts
- https://vercel.com/docs/builds/configure-a-build
- https://vercel.com/docs/package-managers
