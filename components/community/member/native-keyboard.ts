"use client"

/**
 * ===========================================================================
 *  THE KEYBOARD'S OWN HEIGHT, FROM THE iOS APP (round 16)
 * ===========================================================================
 * In the iOS app the web view is not resized for the keyboard (Capacitor's
 * Keyboard plugin, capacitor.config.ts `resize: "none"`, so every other
 * screen behaves as it always has), and WKWebView tells the page little
 * about it: round 15 fell back on a table of iPhone keyboards
 * (post-motion.ts iosKeyboardFor). The plugin says it exactly, before the
 * keyboard moves (keyboardWillShow, its height in CSS px, the bar of arrows
 * and Done included), and that is what the opened post's comment box sits
 * on when it is there (post-motion.ts postBox, source "native").
 *
 * Reached by name (registerPlugin), as lib/checkout/native-wallet.ts reaches
 * Stripe, so the web bundle does not need the npm package: the package is
 * in package.json for `npx cap sync`, which puts the native half into the
 * next app build. Until a phone has that build, isPluginAvailable says no,
 * nothing is listened for, and the table is used as before.
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core"

interface KeyboardInfo {
  keyboardHeight: number
}
interface KeyboardPlugin {
  addListener(event: "keyboardWillShow" | "keyboardDidShow", fn: (info: KeyboardInfo) => void): Promise<PluginListenerHandle>
  addListener(event: "keyboardWillHide" | "keyboardDidHide", fn: () => void): Promise<PluginListenerHandle>
}

const Keyboard = registerPlugin<KeyboardPlugin>("Keyboard")

let height = 0
let started = false
const watchers = new Set<() => void>()

/** Whether this app build carries the Keyboard plugin (false in a browser, and in an app built before it was added). */
export function nativeKeyboardAvailable(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Keyboard")
  } catch {
    return false
  }
}

function start() {
  if (started || typeof window === "undefined" || !nativeKeyboardAvailable()) return
  started = true
  const set = (h: number) => {
    const next = Math.max(0, Math.round(h))
    if (next === height) return
    height = next
    for (const fn of Array.from(watchers)) fn()
  }
  void Keyboard.addListener("keyboardWillShow", (info) => set(info?.keyboardHeight ?? 0)).catch(() => {})
  void Keyboard.addListener("keyboardDidShow", (info) => set(info?.keyboardHeight ?? 0)).catch(() => {})
  void Keyboard.addListener("keyboardWillHide", () => set(0)).catch(() => {})
}

/** The keyboard's height as the app last said it, in CSS px; 0 when it is down or nobody says. */
export function nativeKeyboardHeight(): number {
  start()
  return height
}

/** Told whenever that height changes; returns the way to stop listening. */
export function watchNativeKeyboard(fn: () => void): () => void {
  start()
  watchers.add(fn)
  return () => {
    watchers.delete(fn)
  }
}
