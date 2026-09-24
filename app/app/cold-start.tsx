import { ActivitySpinner } from "@/components/ui/activity-spinner"

/**
 * ===========================================================================
 *  WHAT THE APP SHOWS WHILE IT FINDS THE SESSION
 * ===========================================================================
 * app/app/layout.tsx hands this to NativeAuthGate when the request could not
 * tell who is signed in: the native apps keep the session in Preferences, not
 * in a cookie, so a cold start reaches the server with none, and the gate
 * reads it on the device before anything under /app renders.
 *
 * It used to be a grey drawing of the dashboard under a violet bar: a second
 * version of Home that then turned into Home, and a violet strip under the
 * clock on every cold start. Now it is the shell's own frame, which is what
 * every page arrives in: the header's #111111 across the top, the content
 * area's #f8f9fa below it with the same rounded top, and the same light gray
 * spinner a slow page shows (components/app/app-stage.tsx), in the middle.
 * The corners of that rounded top are the header's colour because the whole
 * window is.
 *
 * The header's height is the shell's: 68px under the status bar on a phone,
 * 58px from md, read with env(safe-area-inset-top) so a browser gets 0.
 */
export default function AppColdStart() {
  return (
    <div data-app-cold-start="" className="fixed inset-0 bg-[#111111] md:bg-[#131316]">
      <div className="absolute inset-x-0 bottom-0 top-[calc(68px+env(safe-area-inset-top,0px))] flex items-center justify-center rounded-t-[20px] bg-[#f8f9fa] md:top-[calc(58px+env(safe-area-inset-top,0px))] md:rounded-none">
        <ActivitySpinner />
      </div>
    </div>
  )
}
