import {
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  Rectangle,
  screen,
} from "electron"
import Store from "./store"

export function createWindow(
  windowName: string,
  options: BrowserWindowConstructorOptions,
): BrowserWindow {
  const key = "window-state"
  const name = `window-state-${windowName}`
  const store = new Store<Rectangle>({ name })
  const defaultSize = {
    width: options.width ?? 1280,
    height: options.height ?? 800,
  }
  let state: Rectangle = {} as Rectangle

  const restore = (): Rectangle => store.get(key, defaultSize as Rectangle)

  const getCurrentPosition = (): Rectangle => {
    const position = win.getPosition()
    const size = win.getSize()
    return {
      x: position[0],
      y: position[1],
      width: size[0],
      height: size[1],
    }
  }

  const windowWithinBounds = (windowState: Rectangle, bounds: Rectangle): boolean => {
    return (
      windowState.x >= bounds.x &&
      windowState.y >= bounds.y &&
      windowState.x + windowState.width <= bounds.x + bounds.width &&
      windowState.y + windowState.height <= bounds.y + bounds.height
    )
  }

  const resetToDefaults = (): Rectangle => {
    const bounds = screen.getPrimaryDisplay().bounds
    return {
      ...(defaultSize as Rectangle),
      x: (bounds.width - defaultSize.width) / 2,
      y: (bounds.height - defaultSize.height) / 2,
    }
  }

  const ensureVisibleOnSomeDisplay = (windowState: Rectangle): Rectangle => {
    const visible = screen.getAllDisplays().some((display) =>
      windowWithinBounds(windowState, display.bounds),
    )
    if (!visible) return resetToDefaults()
    return windowState
  }

  const saveState = (): void => {
    if (!win.isMinimized() && !win.isMaximized()) {
      Object.assign(state, getCurrentPosition())
    }
    store.set(key, state)
  }

  state = ensureVisibleOnSomeDisplay(restore())

  const win = new BrowserWindow({
    ...state,
    ...options,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      ...(options.webPreferences ?? {}),
    },
  })

  win.on("close", saveState)

  return win
}
