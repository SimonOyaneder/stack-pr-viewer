// Browser-mode fallback for `window.api`. Activates only when the renderer is
// served by `next dev` (no Electron preload). Talks to GitHub directly with
// `fetch` and persists the PAT through `./browser-storage`, which encrypts it
// with a non-extractable AES-GCM key in IndexedDB — the browser-side analog
// to Electron's safeStorage. Still not as hardened as the Electron path (XSS
// in the same origin can ask the browser to decrypt), so this is intended for
// local UI iteration.
import type { StackPRApi } from "../../main/preload"
import { clearToken, loadToken, saveToken } from "./browser-storage"
import { GitHubAuthError, fetchAuthoredPRs, fetchViewer } from "./github-client"

const browserApi: StackPRApi = {
  auth: {
    async getViewer() {
      const token = await loadToken()
      if (!token) return { user: null }
      try {
        const user = await fetchViewer(token)
        return { user }
      } catch {
        return { user: null }
      }
    },
    async signIn(raw) {
      if (typeof raw !== "string" || !raw.trim()) {
        return { ok: false, error: "Please paste your Personal Access Token." }
      }
      const token = raw.trim()
      try {
        const user = await fetchViewer(token)
        try {
          await saveToken(token)
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to persist token securely."
          return { ok: false, error: message }
        }
        return { ok: true, user }
      } catch (err) {
        const message =
          err instanceof GitHubAuthError
            ? "GitHub rejected this token. Check it's still valid and has the required scopes."
            : err instanceof Error
              ? err.message
              : "Token validation failed."
        return { ok: false, error: message }
      }
    },
    async signOut() {
      await clearToken()
    },
  },
  prs: {
    async list() {
      const token = await loadToken()
      if (!token) {
        return { ok: false, code: "unauthorized", error: "Not signed in" }
      }
      try {
        const viewer = await fetchViewer(token)
        const prs = await fetchAuthoredPRs(token, viewer.login)
        return { ok: true, prs }
      } catch (err) {
        if (err instanceof GitHubAuthError) {
          return { ok: false, code: "unauthorized", error: err.message }
        }
        const message = err instanceof Error ? err.message : "Failed to fetch PRs"
        return { ok: false, code: "error", error: message }
      }
    },
  },
  shell: {
    async openExternal(url) {
      window.open(url, "_blank", "noopener,noreferrer")
    },
  },
}

export function installBrowserApi(): void {
  if (typeof window === "undefined") return
  const w = window as Window & { api?: StackPRApi }
  if (w.api) return
  w.api = browserApi
}
