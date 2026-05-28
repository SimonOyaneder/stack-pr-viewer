import path from "node:path"
import { app, BrowserWindow, session } from "electron"
import serve from "electron-serve"
import { createWindow } from "./helpers"
import { registerAuthIpc } from "./ipc/auth"
import { registerPrsIpc } from "./ipc/prs"
import { registerShellIpc } from "./ipc/shell"

const isProd = process.env.NODE_ENV === "production"

if (isProd) {
  serve({ directory: "app" })
} else {
  app.setPath("userData", `${app.getPath("userData")} (development)`)
}

let mainWindow: BrowserWindow | null = null

async function bootstrap(): Promise<void> {
  await app.whenReady()

  // Strict CSP in prod; relaxed in dev so Next.js HMR (React Refresh uses eval,
  // and webpack-dev-server uses a websocket) can work. The renderer still never
  // hits external hosts — all data flows through IPC.
  const csp = isProd
    ? [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https://avatars.githubusercontent.com https://*.githubusercontent.com",
        "font-src 'self' data:",
        "connect-src 'self'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join("; ")
    : [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https://avatars.githubusercontent.com https://*.githubusercontent.com",
        "font-src 'self' data:",
        "connect-src 'self' ws://localhost:* http://localhost:*",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join("; ")

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
      },
    })
  })

  registerAuthIpc()
  registerPrsIpc()
  registerShellIpc()

  mainWindow = createWindow("main", {
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0a0a0a",
    title: "Stack PR",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once("ready-to-show", () => mainWindow?.show())

  if (isProd) {
    await mainWindow.loadURL("app://./")
  } else {
    const port = process.argv[2] ?? "8888"
    await mainWindow.loadURL(`http://localhost:${port}/`)
    mainWindow.webContents.openDevTools({ mode: "detach" })
  }
}

void bootstrap()

app.on("window-all-closed", () => {
  app.quit()
})

// Harden navigation: block any attempt to navigate the renderer outside our app,
// and deny window.open() so links must go through the shell IPC handler.
app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: "deny" }))
  contents.on("will-navigate", (event, url) => {
    const ok =
      url.startsWith("app://") ||
      (!isProd && url.startsWith("http://localhost:"))
    if (!ok) event.preventDefault()
  })
})
