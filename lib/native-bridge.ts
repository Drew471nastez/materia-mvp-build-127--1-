"use client"

declare global {
  interface Window {
    StorelibNative?: {
      authStart?: () => void
      authDone?: () => void
      appReady?: () => void
    }
    Capacitor?: {
      isNativePlatform?: () => boolean
    }
  }
}

const NATIVE_AUTH_KEY = "nativeAuthInProgress"

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false
  return typeof window.Capacitor?.isNativePlatform === "function" && window.Capacitor.isNativePlatform()
}

function nativeCall(method: "authStart" | "authDone" | "appReady"): void {
  if (typeof window === "undefined") return
  try {
    window.StorelibNative?.[method]?.()
  } catch {
    // Ignore in browser / non-native contexts.
  }
}

export function nativeAuthStart(): void {
  nativeCall("authStart")
}

export function nativeAuthDone(): void {
  nativeCall("authDone")
}

export function nativeAppReady(): void {
  clearNativeAuthInProgress()
  nativeCall("appReady")
}

export function markNativeAuthInProgress(): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(NATIVE_AUTH_KEY, "1")
  } catch {}
}

export function clearNativeAuthInProgress(): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.removeItem(NATIVE_AUTH_KEY)
  } catch {}
}

export function isNativeAuthInProgress(): boolean {
  if (typeof window === "undefined") return false
  try {
    return sessionStorage.getItem(NATIVE_AUTH_KEY) === "1"
  } catch {
    return false
  }
}
