import { contextBridge, ipcRenderer } from "electron"
import type { SignInResult, ViewerResult } from "./ipc/auth"
import type { ListPrsResult } from "./ipc/prs"

const api = {
  auth: {
    getViewer: (): Promise<ViewerResult> => ipcRenderer.invoke("auth:get-viewer"),
    signIn: (token: string): Promise<SignInResult> => ipcRenderer.invoke("auth:sign-in", token),
    signOut: (): Promise<void> => ipcRenderer.invoke("auth:sign-out"),
  },
  prs: {
    list: (): Promise<ListPrsResult> => ipcRenderer.invoke("prs:list"),
  },
  shell: {
    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke("shell:open-external", url),
  },
} as const

export type StackPRApi = typeof api

contextBridge.exposeInMainWorld("api", api)
