/**
 * The upload hook the OnePage editor's picture and video fields share
 * (components/onepage/upload-progress useMediaUpload), on its own, for
 * scripts/check-onepage-editor-bugs.mjs. The probe bundles it with
 * lib/onepage/media-upload stubbed: an upload that ignores Stop, as one whose
 * bytes were already up when Stop came does. `window.up` is the hook.
 */
import { createRoot } from "react-dom/client"
import { useMediaUpload } from "@/components/onepage/upload-progress"

function Harness() {
  const up = useMediaUpload()
  ;(window as unknown as { up: typeof up }).up = up
  return <div data-upload-phase={up.state.phase} />
}

createRoot(document.getElementById("root")!).render(<Harness />)
