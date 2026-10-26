/**
 * ===========================================================================
 *  THE EDITOR'S FRAME, DRAWN BEFORE THE EDITOR IS
 * ===========================================================================
 * "Sometimes when I go into the website builder the whole screen flashes
 * white instead of loading clean." The editor fades in over 240ms
 * (.wb-editor-enter) over whatever is under it, and what was under it was
 * white: the body on the canonical /store/…/editor route, and this box's
 * `bg-background` on /website-builder. The dark bar went white and came
 * back, the whole screen with it.
 *
 * So under the editor there is the editor's own shape: its surround
 * (#eef1f5) and its dark bar (#171717, 48px plus the status bar, the
 * --wb-topbar and --wb-chrome-bg in app/globals.css). The fade is now from
 * the frame to the same frame with the page in it, and nothing else about
 * the editor changes.
 *
 * `fixed inset-0`, as the editor's own root is: an `h-svh` wrapper is
 * content, and the body's safe-area padding would sit under it.
 */
import { EditorGround } from "./editor-ground"

export function EditorFrame({ children }: { children: React.ReactNode }) {
  return (
    /* `wb-frame`: the head script holds the first paint until this is read (app/layout.tsx, round 12). */
    /* `touch-action: manipulation`: a double tap is two taps, never a zoom of the editor (round 20, app/website-builder/layout.tsx NO ZOOM IN THE EDITOR). */
    <div id="wb-frame" className="fixed inset-0 overflow-hidden bg-[#eef1f5] [touch-action:manipulation]" data-wb-frame="">
      <EditorGround />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 bg-[#171717]"
        style={{ height: "calc(48px + env(safe-area-inset-top, 0px))" }}
      />
      {children}
    </div>
  )
}
