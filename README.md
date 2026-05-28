# Stack PR Viewer

Visualize your GitHub Pull Requests as an interactive dependency tree, **as a native desktop app**. When a PR is based on another's branch (stacked PRs), they're linked into trees so you can see at a glance how your in-flight work branches out.

![Electron](https://img.shields.io/badge/Electron-33-47848f) ![Next.js](https://img.shields.io/badge/Next.js-15-000) ![React](https://img.shields.io/badge/React-19-61dafb) ![Tailwind](https://img.shields.io/badge/Tailwind-4-38bdf8) ![shadcn](https://img.shields.io/badge/shadcn%2Fui-new--york-000)

No webserver, no database, no OAuth App. You paste a GitHub **Personal Access Token (PAT)** and the app fetches your authored PRs and renders them as a forest of stacks.

## Build

```bash
npm install
npm run build:mac    # macOS   — nextron build --mac + scripts/make-dmg.sh arm64
npm run build:win    # Windows — NSIS installer (.exe)
npm run build:linux  # Linux   — AppImage
npm run build        # current platform, default target
```

All artifacts are written to `dist/`. After `npm run build:mac` you'll find:

| File | What it is |
| --- | --- |
| `dist/Stack PR-<version>-arm64.dmg` | **Installer** — open it and drag the app to Applications |
| `dist/mac-arm64/Stack PR.app` | The app bundle itself (double-click to run directly) |
| `dist/Stack PR-<version>-arm64-mac.zip` | Zipped app bundle |

`<version>` comes from `package.json` (currently `0.0.0`). On Windows the NSIS installer (`.exe`) lands in `dist/`; on Linux, the `AppImage`. Packaging details (icons, signing, targets) live in `electron-builder.yml`. To regenerate icons: `npm run icons`.

> The macOS build is **unsigned** (`identity: null`). On first open, right-click the app → **Open** to get past Gatekeeper.

## Development environment

```bash
npm install
npm run dev:app      # Nextron — Electron + Next.js with hot reload (the real product)
npm run dev          # browser-only on :8888 — fast UI iteration, NO Electron
```

There are **two run modes**, and `window.api` is provided differently in each:

- **`dev:app` (Electron)** — the PAT lives only in the main process; the renderer talks to GitHub over IPC through the preload. This is the real distribution.
- **`dev` (browser)** — plain `next dev`, no preload. `_app.tsx` installs a `window.api` shim that hits GitHub directly with `fetch` and stores the PAT client-side (encrypted IndexedDB). For fast UI work only.

The renderer code is identical in both modes: it always calls `window.api.{auth,prs,shell}`. What changes is who answers.

On first launch you'll see the login screen. Generate a token on github.com (the button opens your browser with the scopes pre-filled), paste it, and hit **Continue**. The app validates the token against GitHub and persists it encrypted in your OS keychain.

**PAT scopes:** `repo` (PRs in private/org repos), `read:org`, `read:user`. For public repos only, use `public_repo` instead of `repo`. In orgs with SAML SSO, authorize the token via the **Configure SSO** button.

### Verification

```bash
npm run lint         # next lint on renderer
npm run typecheck    # tsc --noEmit on both main and renderer
```

No test framework is configured.

## Stack

A **Nextron** (Electron + Next.js) app with two strictly separated processes:

- **`main/`** — Electron main process (Node). Owns the PAT, talks to GitHub via Octokit/GraphQL, exposes IPC handlers. Entry point: `main/main.ts`.
- **`renderer/`** — Next.js 15 Pages Router + React 19 + Tailwind v4 + shadcn/ui (`new-york` style). Statically exported and served via `electron-serve` (`app://` scheme) in production. No SSR, no API routes, no cookies.

Layout, rendering, and domain:

- **React Flow + dagre** (`stack-graph.tsx`, `layout.ts`) for the auto-laid-out tree, with vertical/horizontal layout, mini-map, pan and zoom.
- **Stack detection** (`stack.ts`): `B` is stacked on `A` iff `B.baseRef === A.headRef` within the same repo. Builds a forest (`buildStackForest`), not a single tree.

### Duplicated-by-design pairs

There's no shared package — Nextron's build treats each process separately, so some code is duplicated on purpose. If you touch one half, update the other:

1. `main/lib/types.ts` ↔ `renderer/lib/types.ts` — PR domain types.
2. `main/lib/github.ts` (Octokit) ↔ `renderer/lib/github-client.ts` (`fetch`) — the GraphQL query and `normalizePR`. They must produce the same `PullRequest` shape.
3. `main/preload.ts` (Electron) ↔ `renderer/lib/browser-api.ts` (browser) — both implement the same `StackPRApi`.

## PAT security

**In Electron mode, the PAT lives only in the main process. The renderer never sees it.**

- **Persistence** — `electron.safeStorage.encryptString(token)` → bytes written to `${userData}/token.bin` (mode `0600`). The encryption key is OS-managed: Keychain (macOS), DPAPI (Windows), libsecret/kwallet (Linux). No `SESSION_SECRET` to manage.
- **IPC contract** — the renderer only talks via `window.api.{auth,prs,shell}` (exposed through `contextBridge`). Tightly scoped verbs (`auth:sign-in`, `prs:list`, `shell:open-external`); there's no generic "make a request" surface.
- **Window hardening** — `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Strict CSP (`default-src 'self'`, `connect-src 'self'`, `img-src` limited to GitHub avatar hosts). `setWindowOpenHandler` denies all `window.open`; `will-navigate` blocks navigation outside `app://` (prod) or `http://localhost` (dev).
- **External links** — clicks on PR nodes call `shell:open-external`, which validates the URL is `https:` and the host is `github.com` / `*.github.com` / `*.githubusercontent.com` before invoking `shell.openExternal`. The renderer cannot open arbitrary URLs.
- **Auto sign-out** — a 401 from GitHub triggers `auth:sign-out`, which deletes `token.bin`.

> **Browser mode (`npm run dev`):** the PAT is encrypted at rest with an `extractable: false` AES-GCM key stored in IndexedDB (`browser-storage.ts`), the closest browser analog to `safeStorage`. It still can't defend against same-origin XSS, and `shell.openExternal` there is just `window.open`. It's for local UI work, not a hardened distribution path.
