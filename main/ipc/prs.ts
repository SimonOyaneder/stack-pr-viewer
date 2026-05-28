import { ipcMain } from "electron"
import { fetchAuthoredPRs, fetchViewer, GitHubAuthError } from "../lib/github"
import { loadToken } from "../lib/token-store"
import type { PullRequest } from "../lib/types"

export type ListPrsResult =
  | { ok: true; prs: PullRequest[] }
  | { ok: false; code: "unauthorized" | "error"; error: string }

export function registerPrsIpc(): void {
  ipcMain.handle("prs:list", async (): Promise<ListPrsResult> => {
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
  })
}
