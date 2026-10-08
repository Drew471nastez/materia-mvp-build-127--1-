import { isNativeApp } from "@/lib/platform-utils"

/** sessionStorage for the tab; on the native app also mirror to localStorage so a process kill keeps community context and scroll. */
export function tabStorageGet(key: string): string | null {
  if (typeof window === "undefined") return null
  try {
    const v = sessionStorage.getItem(key)
    if (v != null && v !== "") return v
  } catch {
    /* private mode */
  }
  if (!isNativeApp()) return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function tabStorageSet(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    /* */
  }
  if (!isNativeApp()) return
  try {
    localStorage.setItem(key, value)
  } catch {
    /* */
  }
}

export function tabStorageRemove(key: string) {
  try {
    sessionStorage.removeItem(key)
  } catch {
    /* */
  }
  if (!isNativeApp()) return
  try {
    localStorage.removeItem(key)
  } catch {
    /* */
  }
}
