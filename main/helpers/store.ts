import { app } from "electron"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

interface StoreOptions {
  name: string
  defaults?: Record<string, unknown>
}

export default class Store<T = unknown> {
  private path: string
  private data: Record<string, unknown>

  constructor(opts: StoreOptions) {
    this.path = path.join(app.getPath("userData"), `${opts.name}.json`)
    this.data = this.parseDataFile(opts.defaults ?? {})
  }

  private parseDataFile(defaults: Record<string, unknown>): Record<string, unknown> {
    try {
      return JSON.parse(readFileSync(this.path, "utf8"))
    } catch {
      return { ...defaults }
    }
  }

  get(key: string, fallback: T): T {
    const value = this.data[key]
    return (value as T) ?? fallback
  }

  set(key: string, value: T): void {
    this.data[key] = value
    try {
      writeFileSync(this.path, JSON.stringify(this.data))
    } catch (err) {
      console.error("Store.set failed", err)
    }
  }
}
