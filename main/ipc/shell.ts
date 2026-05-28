import { ipcMain, shell } from "electron"

const ALLOWED_HOSTS = [
  "github.com",
  "www.github.com",
  "gist.github.com",
]
const ALLOWED_HOST_SUFFIXES = [".github.com", ".githubusercontent.com"]

function isAllowed(url: URL): boolean {
  if (url.protocol !== "https:") return false
  if (ALLOWED_HOSTS.includes(url.hostname)) return true
  return ALLOWED_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix))
}

export function registerShellIpc(): void {
  ipcMain.handle("shell:open-external", async (_event, raw: unknown): Promise<void> => {
    if (typeof raw !== "string") return
    let parsed: URL
    try {
      parsed = new URL(raw)
    } catch {
      return
    }
    if (!isAllowed(parsed)) return
    await shell.openExternal(parsed.toString())
  })
}
