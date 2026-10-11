import { PlainPage } from "../../../fix/page"
import { serverDelay } from "../../../fix/delay"
export const dynamic = "force-dynamic"
export default async function Website() { await serverDelay("website", 400); return <PlainPage title="Website" rows={6} /> }
