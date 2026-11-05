import type { Metadata } from "next"
import { getServerTt } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return {
    title: tt("Emails"),
  }
}

export default function EmailsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
