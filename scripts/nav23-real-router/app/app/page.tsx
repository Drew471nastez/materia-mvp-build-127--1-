import { PlainPage } from "../../fix/page"
import { serverDelay } from "../../fix/delay"
export const dynamic = "force-dynamic"
export default async function Home() { await serverDelay("home", 200); return <PlainPage title="Home" /> }
