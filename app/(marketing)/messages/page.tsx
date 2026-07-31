import type { Metadata } from "next"
import { MessagesInbox } from "@/components/messages/inbox"

export const metadata: Metadata = {
  title: "Mesaje | Storelib",
  robots: { index: false, follow: true },
}

export default function MessagesPage() {
  return <MessagesInbox />
}
