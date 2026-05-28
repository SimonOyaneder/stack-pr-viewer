import { app, safeStorage } from "electron"
import { promises as fs } from "node:fs"
import path from "node:path"

const FILE_NAME = "token.bin"

function tokenPath(): string {
  return path.join(app.getPath("userData"), FILE_NAME)
}

export async function saveToken(token: string): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      "Secure storage is not available on this system. " +
        "Make sure your OS keychain (Keychain on macOS, DPAPI on Windows, " +
        "or kwallet/gnome-libsecret on Linux) is accessible.",
    )
  }
  const encrypted = safeStorage.encryptString(token)
  await fs.writeFile(tokenPath(), encrypted, { mode: 0o600 })
}

export async function loadToken(): Promise<string | null> {
  let buf: Buffer
  try {
    buf = await fs.readFile(tokenPath())
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null
    return null
  }
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(buf)
  } catch {
    return null
  }
}

export async function deleteToken(): Promise<void> {
  try {
    await fs.unlink(tokenPath())
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
  }
}
