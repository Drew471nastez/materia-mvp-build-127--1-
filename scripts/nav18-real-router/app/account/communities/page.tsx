import { serverDelay } from "../../../fix/delay"
import { Rows } from "../../../fix/rows"
export const dynamic = "force-dynamic"
export default async function P() {
  await serverDelay("page", 250)
  return <Rows label="communities" />
}
