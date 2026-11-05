import type { Metadata } from "next"

import { HubPage, devMetadata } from "@/components/developers/hub-page"


export const metadata: Metadata = devMetadata("")

export default function DeveloperHubPage() {
  return <HubPage slug="" />
}
