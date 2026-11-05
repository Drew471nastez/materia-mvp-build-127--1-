// ============================================================
// Canonical editor URL:
//   /store/{creatorSlug}/themes/{installId}/editor?previewPath=…
//
// This route is a thin wrapper around the existing client editor
// (`@/app/(storelib)/website-builder/editor/[installId]/page`). We keep the client
// component in a single place so both the canonical and the legacy
// `/website-builder/editor/[installId]` routes render the exact same UI
// and share all the editor state logic.
// ============================================================
import type { Metadata } from "next"
import EditorClient from "@/app/(storelib)/website-builder/editor/[installId]/page"

/* The editor is one person's own screen, never a page to index. */
export const metadata: Metadata = { robots: { index: false, follow: false } }

type PageProps = {
  params: Promise<{ creatorSlug: string; installId: string }>
}

export default async function StoreThemeEditorRoute({ params }: PageProps) {
  // Await the route params on the server, then re-wrap the installId in a
  // pre-resolved Promise so the client component's `use(params)` call
  // resolves instantly. We deliberately drop `creatorSlug` here — it's in
  // the URL for display/share purposes only; the editor pulls creator data
  // from the API on mount.
  const { installId } = await params
  return <EditorClient params={Promise.resolve({ installId })} />
}
