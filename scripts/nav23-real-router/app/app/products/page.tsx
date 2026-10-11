import { PlainPage } from "../../../fix/page"
import { OpenProduct } from "../../../fix/product-bits"
import { serverDelay } from "../../../fix/delay"
export const dynamic = "force-dynamic"
export default async function Products() { await serverDelay("products", 300); return <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter"><div className="px-4"><OpenProduct /></div><PlainPage title="Products" rows={12} /></div> }
