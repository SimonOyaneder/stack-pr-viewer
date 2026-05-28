import { ipcMain } from "electron"
import { fetchViewer, GitHubAuthError, type GitHubUser } from "../lib/github"
import { deleteToken, loadToken, saveToken } from "../lib/token-store"

export type SignInResult =
  | { ok: true; user: GitHubUser }
  | { ok: false; error: string }

export type ViewerResult = { user: GitHubUser | null }

export function registerAuthIpc(): void {
  ipcMain.handle("auth:get-viewer", async (): Promise<ViewerResult> => {
    const token = await loadToken()
    if (!token) return { user: null }
    try {
      const user = await fetchViewer(token)
      return { user }
    } catch {
      return { user: null }
    }
  })

  ipcMain.handle("auth:sign-in", async (_event, raw: unknown): Promise<SignInResult> => {
    if (typeof raw !== "string" || !raw.trim()) {
      return { ok: false, error: "Please paste your Personal Access Token." }
    }
    const token = raw.trim()
    let user: GitHubUser
    try {
      user = await fetchViewer(token)
    } catch (err) {
      const message =
        err instanceof GitHubAuthError
          ? "GitHub rejected this token. Check it's still valid and has the required scopes."
          : err instanceof Error
            ? err.message
            : "Token validation failed."
      return { ok: false, error: message }
    }
    try {
      await saveToken(token)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to persist token securely."
      return { ok: false, error: message }
    }
    return { ok: true, user }
  })

  ipcMain.handle("auth:sign-out", async (): Promise<void> => {
    await deleteToken()
  })
}
