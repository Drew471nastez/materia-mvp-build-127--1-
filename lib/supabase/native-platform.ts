/**
 * Detect Capacitor native platform synchronously.
 * window.Capacitor is injected by the native bridge before any JS runs,
 * so this is reliable as long as we're in a browser context.
 *
 * Its own file (round 46) so the platform header can ask it on every press
 * without importing the Supabase client, which it now fetches only when it
 * reads the session (lib/supabase/browser-lazy.ts). lib/supabase/client.ts
 * re-exports it, so every existing import keeps working.
 */
export function isNativePlatform(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as any).Capacitor?.isNativePlatform === "function" &&
    (window as any).Capacitor.isNativePlatform()
  )
}
