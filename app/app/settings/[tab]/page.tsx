import { redirect } from "next/navigation"

export default async function SettingsTabPage({
  params,
}: {
  params: Promise<{ tab: string }>
}) {
  const { tab } = await params

  // billing has its own dedicated page at /app/settings/billing
  if (tab === "billing") {
    redirect("/app/settings/billing")
  }

  redirect("/app/settings")
}
