import type { Metadata } from "next"
import { MessageThread } from "@/components/messages/thread"

export const metadata: Metadata = {
  title: "Conversație | Storelib",
  robots: { index: false, follow: false },
}

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <MessageThread id={id} />
}
