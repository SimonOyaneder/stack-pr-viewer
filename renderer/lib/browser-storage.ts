// Browser-mode token storage: encrypted at rest via Web Crypto + IndexedDB.
//
// The PAT is encrypted with AES-GCM. The AES key is generated with
// `extractable: false` so its material never appears as a JS string and can't
// be exfiltrated through dev tools or storage exports — it can only be used
// in-process via crypto.subtle on this origin. Both the key handle and the
// encrypted blob live in IndexedDB; localStorage is never touched (except for
// a one-time migration from the previous, unencrypted version).
//
// This is the closest browser analog to Electron's safeStorage (Keychain /
// DPAPI / libsecret). It still doesn't defend against XSS in the same origin —
// any script that runs here can ask the browser to decrypt — but it removes
// the "plaintext token on disk" failure mode.

const DB_NAME = "stack-pr"
const DB_VERSION = 1
const STORE = "secrets"
const KEY_RECORD = "aes-key"
const TOKEN_RECORD = "pat"
const LEGACY_LS_KEY = "stack-pr:pat"

interface EncryptedBlob {
  iv: ArrayBuffer
  ciphertext: ArrayBuffer
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly")
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
}

function idbPut(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite")
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function idbDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite")
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function getOrCreateKey(db: IDBDatabase): Promise<CryptoKey> {
  const existing = await idbGet<CryptoKey>(db, KEY_RECORD)
  if (existing) return existing
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
  await idbPut(db, KEY_RECORD, key)
  return key
}

function readLegacyLocalStorage(): string | null {
  try {
    return window.localStorage.getItem(LEGACY_LS_KEY)
  } catch {
    return null
  }
}

function clearLegacyLocalStorage(): void {
  try {
    window.localStorage.removeItem(LEGACY_LS_KEY)
  } catch {
    // ignore
  }
}

export async function saveToken(token: string): Promise<void> {
  const db = await openDb()
  const key = await getOrCreateKey(db)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(token),
  )
  const blob: EncryptedBlob = { iv: iv.buffer, ciphertext }
  await idbPut(db, TOKEN_RECORD, blob)
}

export async function loadToken(): Promise<string | null> {
  const legacy = readLegacyLocalStorage()
  if (legacy) {
    try {
      await saveToken(legacy)
    } finally {
      clearLegacyLocalStorage()
    }
  }
  const db = await openDb()
  const blob = await idbGet<EncryptedBlob>(db, TOKEN_RECORD)
  if (!blob) return null
  const key = await idbGet<CryptoKey>(db, KEY_RECORD)
  if (!key) return null
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: blob.iv },
      key,
      blob.ciphertext,
    )
    return new TextDecoder().decode(plaintext)
  } catch {
    return null
  }
}

export async function clearToken(): Promise<void> {
  clearLegacyLocalStorage()
  try {
    const db = await openDb()
    await idbDelete(db, TOKEN_RECORD)
  } catch {
    // ignore
  }
}
