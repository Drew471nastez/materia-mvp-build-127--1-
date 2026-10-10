import { serverDelay } from "../../../fix/delay"
import { AccountPostsFix } from "../../../fix/account-posts-fix"
export const dynamic = "force-dynamic"
export default async function P() {
  await serverDelay("page", 250)
  return <AccountPostsFix />
}
