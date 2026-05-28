# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                 # next dev renderer -p 8888 — browser-only mode (NO Electron). See "Two run modes".
npm run dev:app             # nextron — full Electron + Next.js dev with hot reload
npm run lint                # next lint --dir renderer
npm run typecheck           # tsc --noEmit on both main and renderer
npm run typecheck:main      # only the Electron main process (tsconfig.json)
npm run typecheck:renderer  # only the Next.js renderer (renderer/tsconfig.json)
npm run icons               # regenerate app icons from source (scripts/make-icons.mjs)
npm run build               # nextron build — package the desktop app for the current platform
npm run build:mac           # nextron build --mac, then scripts/make-dmg.sh arm64 (.dmg)
npm run build:win           # nextron build --win (.exe / NSIS)
npm run build:linux         # nextron build --linux (AppImage)
```

No test framework is configured.

## Two run modes (important)

The renderer can run in **two** environments, and `window.api` is provided differently in each:

- **Electron mode** (`npm run dev:app`, and all packaged builds) — `window.api` is injected by the preload via `contextBridge`. The PAT lives only in the main process; the renderer talks to GitHub through IPC. This is the real product.
- **Browser mode** (`npm run dev`) — plain `next dev`, no Electron, no preload. `renderer/pages/_app.tsx` calls `installBrowserApi()` (`renderer/lib/browser-api.ts`), which installs a `window.api` shim **only if one isn't already present**. The shim talks to GitHub directly with `fetch` and stores the PAT client-side. This exists purely for fast UI iteration in a browser.

The renderer code is identical across both modes — it always just calls `window.api.{auth,prs,shell}`. What changes is who answers.

## Architecture

A Nextron (Electron + Next.js) desktop app. **No webserver, no database, no OAuth App.** The user pastes a GitHub Personal Access Token; the app fetches authored PRs and renders them as an interactive dependency tree.

Two processes:

- **`main/`** — Electron main process (Node). Owns the PAT, talks to GitHub, exposes IPC handlers. Entry point is `main/main.ts`. Compiled by Nextron with webpack/babel to CommonJS.
- **`renderer/`** — Next.js 15 Pages Router + React 19 + Tailwind v4 + shadcn/ui (new-york style). Statically exported by Nextron and served via `electron-serve` (custom `app://` scheme) in production. No SSR, no API routes, no server actions, no cookies.

### Three duplicated-by-design pairs (keep in sync)

There is **no** shared package — Nextron's build pipeline treats each side separately, so shared code is duplicated on purpose. When you touch one half, update the other:

1. `main/lib/types.ts` ↔ `renderer/lib/types.ts` — the PR domain types.
2. `main/lib/github.ts` ↔ `renderer/lib/github-client.ts` — the GraphQL query, `normalizePR`, reviewer-state computation, and CI/review mappers. The main version uses Octokit; the renderer version uses raw `fetch` (browser-safe). They must produce identical `PullRequest` shapes.
3. The `window.api` surface — `main/preload.ts` (Electron) ↔ `renderer/lib/browser-api.ts` (browser). Both must implement the same `StackPRApi`.

## Auth + PAT security

**In Electron mode, the PAT lives only in the main process — the renderer never sees it.** (In browser mode this guarantee does not hold; see below.)

- **`main/lib/token-store.ts`** — persists the PAT with Electron's `safeStorage` (Keychain on macOS, DPAPI on Windows, libsecret/kwallet on Linux). File: `${app.getPath("userData")}/token.bin`, mode 0600. The OS owns the encryption key. Exports `saveToken` / `loadToken` / `deleteToken`.
- **`main/ipc/auth.ts`** — three IPC handlers (`auth:get-viewer`, `auth:sign-in`, `auth:sign-out`). `sign-in` validates against GitHub before persisting and returns `{ ok, user }` on success so the renderer doesn't need a follow-up call.
- **`main/ipc/prs.ts`** — `prs:list` handler (takes **no** arguments). Loads token, fetches viewer + authored PRs. Returns `{ ok: false, code: "unauthorized" }` on 401 so the renderer can auto-sign-out without ever seeing the token state.
- **`main/ipc/shell.ts`** — `shell:open-external` is the **only** way the renderer can open a URL. It validates the URL is `https:` and that the host is `github.com` (incl. `www.`/`gist.`) or any `*.github.com` / `*.githubusercontent.com` suffix before calling `shell.openExternal`. The renderer cannot open arbitrary URLs.

**Browser mode caveat:** `renderer/lib/browser-storage.ts` encrypts the PAT at rest with an AES-GCM key generated `extractable: false`, stored alongside the ciphertext in IndexedDB (the closest browser analog to safeStorage). It still cannot defend against same-origin XSS, and `shell.openExternal` there is just `window.open`. Browser mode is for local UI work, not a hardened distribution path.

Window hardening (`main/main.ts`):

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- CSP injected via `onHeadersReceived`: strict in prod (`default-src 'self'`, `connect-src 'self'`, `img-src` limited to github avatar hosts + `data:`); relaxed in dev to allow Next.js HMR (`'unsafe-eval'`, `ws://localhost:*`).
- `setWindowOpenHandler` denies all `window.open` calls; `will-navigate` blocks navigation outside `app://` (prod) or `http://localhost:` (dev).

The preload (`main/preload.ts`) is the **only** bridge in Electron mode. It exposes `window.api.{auth,prs,shell}` via `contextBridge`. Adding a new IPC verb means: handler in `main/ipc/<name>.ts`, register it in `main/main.ts`, export from `preload.ts`, mirror it in `renderer/lib/browser-api.ts`, and (because `preload.ts` exports `StackPRApi`) the renderer's `window.api` types update automatically through `renderer/types/window.d.ts`.

## Data flow

1. `renderer/pages/index.tsx` calls `window.api.auth.getViewer()` on mount. If `user === null` → `<LoginScreen />`. Otherwise → `<Dashboard />`.
2. `<LoginScreen />` calls `window.api.auth.signIn(pat)`. On success it returns the `user` directly (`onSignedIn`) and the page mounts the dashboard.
3. `<Dashboard />` calls `window.api.prs.list()` (no args) on mount, on manual refresh, and on a 60s interval / visibility change (silent poll). A 401 (`code: "unauthorized"`) triggers `window.api.auth.signOut()` and clears the user state. The dashboard diffs results with `samePRSet` to avoid re-rendering when nothing changed.
4. All PR clicks call `window.api.shell.openExternal(pr.url)` — there is no `window.open` in renderer code.

Note: `prs:list` only fetches **open** PRs — the GraphQL query is `is:pr author:<viewer> is:open sort:updated-desc`, capped at 100. There is currently no "include closed" toggle (some leftover UI copy still mentions it).

## Stack detection (the core domain logic)

In `renderer/lib/stack.ts` (pure, no Node imports):

- A PR `B` is "stacked on" PR `A` iff `B.baseRef === A.headRef` **within the same `repoFullName`**. The lookup key is `${repoFullName}@${branch}`.
- `buildStackForest(prs)` returns `{ prsById, edges, roots, childrenOf }` — a forest, not a tree.
- `listStackGroups` walks each root iteratively and groups descendant PR IDs; sorted by descending size so multi-PR stacks appear first.

`dashboard.tsx` and `stack-graph.tsx` both consume `forest.childrenOf` directly, so the data shape is load-bearing.

## Review status & coloring

`renderer/lib/review-status.ts` derives a single `ReviewStatus` (`approved | pending | not_approved | none`) per PR from `reviewDecision` + `reviewerStates`, and maps PRs to accent colors (`prAccentColor`). The dashboard's stat cards/filters and `pr-node.tsx` both read from here, so it's the single source of truth for "what color/state is this PR". Bot reviewers (`rubotina-ci`, `github-actions`, anything `__typename: "Bot"`) are filtered out when computing reviewer states in the GitHub clients.

## Rendering

- **`renderer/components/stack-graph.tsx`** wraps everything in `<ReactFlowProvider>`. Layout is recomputed in a `useMemo` from `prs` + `direction`; the inner `useEffect` resets nodes/edges and calls `fitView` whenever inputs change.
- **`renderer/lib/layout.ts`** wraps `@dagrejs/dagre`. Default node size is 320×200 — bumping `pr-node.tsx` height means updating this default.
- **`renderer/components/pr-node.tsx`** is the only custom node type (registered as `nodeTypes = { pr: PRNode }`).

## Conventions

- The renderer is a static export. **No** `getServerSideProps`, **no** API routes, **no** `cookies()`, **no** Node built-ins. Imports of `node:*` from renderer code will silently break the production build.
- All renderer ↔ main communication goes through `window.api`. In Electron mode, adding a `fetch()` to an external host from the renderer will fail (CSP blocks `connect-src`). The only renderer code that hits GitHub directly is `renderer/lib/github-client.ts`, used exclusively by the browser-mode shim.
- Failures in `auth:get-viewer` deliberately return `{ user: null }` rather than throwing — invalid/revoked tokens behave like "logged out".
- All PR-shape data flows through `normalizePR`. Add new fields to **both** `main/lib/types.ts` and `renderer/lib/types.ts`, then populate them in **both** `normalizePR` implementations (`main/lib/github.ts` and `renderer/lib/github-client.ts`), then consume downstream.
- shadcn/ui is configured with the `new-york` style. `components.json` aliases point at `renderer/`, so `npx shadcn add <component>` installs into `renderer/components/ui/`.

## What lives where

```
main/
  main.ts              # Electron entry: BrowserWindow, CSP, navigation hardening, IPC registration
  preload.ts           # contextBridge → window.api (exports StackPRApi type)
  ipc/
    auth.ts            # auth:get-viewer | auth:sign-in | auth:sign-out
    prs.ts             # prs:list (open PRs only, no args)
    shell.ts           # shell:open-external (https + github-host whitelist)
  lib/
    github.ts          # Octokit + GraphQL fetch + normalizePR (main side)
    token-store.ts     # safeStorage-backed PAT persistence
    types.ts           # PR domain types (sync with renderer/lib/types.ts)
  helpers/
    index.ts           # re-exports createWindow
    create-window.ts   # window-state persistence
    store.ts           # tiny JSON store (window bounds only — never secrets)
renderer/
  pages/
    _app.tsx           # Providers + installBrowserApi() (browser-mode shim)
    _document.tsx
    index.tsx          # routes to LoginScreen or Dashboard based on getViewer()
  components/
    login-screen.tsx   # form → window.api.auth.signIn
    dashboard.tsx      # window.api.prs.list, polling, filters, sign-out
    stack-graph.tsx    # React Flow + dagre layout
    pr-node.tsx        # custom node — opens PR via shell.openExternal
    mode-toggle.tsx
    providers.tsx
    ui/                # shadcn primitives
  lib/
    stack.ts           # stack-forest construction (core domain logic)
    layout.ts          # dagre wrapper
    review-status.ts   # ReviewStatus + accent colors
    github-client.ts   # browser-safe GitHub fetch (sync with main/lib/github.ts)
    browser-api.ts     # window.api shim for browser mode (sync with main/preload.ts)
    browser-storage.ts # AES-GCM + IndexedDB PAT storage (browser mode only)
    types.ts           # PR domain types (sync with main/lib/types.ts)
    utils.ts
  styles/globals.css
  types/window.d.ts    # declares window.api from StackPRApi
electron-builder.yml   # packaging targets (dmg/nsis/AppImage)
tsconfig.json          # tsconfig for main/
renderer/tsconfig.json # tsconfig for renderer/ (extends Next defaults)
```
