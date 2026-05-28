import type { StackPRApi } from "../../main/preload"

declare global {
  interface Window {
    api: StackPRApi
  }
}

export {}
