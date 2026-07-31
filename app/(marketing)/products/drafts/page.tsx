import type { Metadata } from "next"
import { DraftsList } from "@/components/sell/drafts-list"

// Somewhere for a saved draft to actually go. Saving one and having no way back
// to it means the draft button is a place things disappear into.
export const metadata: Metadata = {
  title: "Ciorne | Storelib",
  robots: { index: false, follow: false },
}

export default function DraftsPage() {
  return <DraftsList />
}
