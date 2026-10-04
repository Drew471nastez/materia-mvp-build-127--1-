"use client"

/**
 * Collections: a list of the shop's own, and one editor for both kinds.
 * Manual is a hand-picked list; smart is every product matching its rules
 * (all of them or any), kept up to date by itself. A published collection
 * can be shown by the website and used by a discount code.
 *
 * FOR EVERY KIND OF PRODUCT. A collection groups downloads, courses,
 * memberships, services and physical goods alike, the way Shopify's and
 * Payhip's do. Only the rules that need stock and weight wait for physical
 * commerce, since nothing else has either.
 */

import * as React from "react"
import { Check, Layers, Plus, Search, Trash2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { GUTTER, LIST_BAR, LIST_WIDTH, PaneBar, card } from "../orders/order-parts"
import { RULE_FIELDS, RULE_FIELD_LABEL, RULE_OPS, RULE_OP_LABEL, type CollectionRule, type RuleField, type RuleOp } from "@/lib/physical/collections"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { BTN_DANGER, BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, Empty, Field, Modal, Notice, Pill, SelectInput, TextInput, Toggle, api } from "@/components/physical/ui"

interface Collection {
  id: string
  title: string
  slug: string
  description: string | null
  kind: "manual" | "smart"
  rules: CollectionRule[]
  match: "all" | "any"
  sort: string
  published: boolean
  productIds: string[]
}
interface Product {
  id: string
  title: string
  thumbnail_url: string | null
  type: string
  status: string
  price_cents: number
}

/** The kinds a product can be, as a rule on Product type reads them. */
const PRODUCT_KINDS = [
  ["digital", "Digital product"],
  ["course", "Course"],
  ["membership", "Membership"],
  ["community", "Community"],
  ["service", "Service"],
  ["physical", "Physical product"],
] as const
const KIND_LABEL: Record<string, string> = Object.fromEntries(PRODUCT_KINDS)
/** Rules that only mean something for goods with stock and weight. */
const PHYSICAL_RULES: ReadonlySet<string> = new Set(["vendor", "inventory", "weight"])

const SORTS = [
  ["manual", "Your order"],
  ["best_selling", "Best selling"],
  ["newest", "Newest"],
  ["price_asc", "Price, low to high"],
  ["price_desc", "Price, high to low"],
  ["title", "Name, A to Z"],
] as const

export function CollectionsClient() {
  const [list, setList] = React.useState<Collection[] | null>(null)
  const [products, setProducts] = React.useState<Product[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [editing, setEditing] = React.useState<Collection | "new" | null>(null)
  const load = React.useCallback(async () => {
    const r = await api<{ collections: Collection[]; products: Product[] }>("/api/collections")
    if (!r.ok) return setError(r.error)
    setList(r.data.collections)
    setProducts(r.data.products)
  }, [])
  React.useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter">
      <PaneBar width={LIST_WIDTH} className={LIST_BAR}>
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Collections</h1>
        <button type="button" className={BTN_PRIMARY} onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" />
          New collection
        </button>
      </PaneBar>
      <div className={cn("mx-auto pb-24 md:pb-8", LIST_WIDTH, GUTTER)}>
        {error ? <Notice className="mt-3">{error}</Notice> : null}
        <section className={cn(card, "mt-3 overflow-hidden")} aria-label="Collections">
          {list === null && !error ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-[#f4f5f7]" />
              ))}
            </div>
          ) : list && list.length === 0 ? (
            <Empty
              title="No collections yet"
              action={
                <button type="button" className={BTN_PRIMARY} onClick={() => setEditing("new")}>
                  <Plus className="h-4 w-4" />
                  New collection
                </button>
              }
            >
              Group products, like New in, Courses or Under $30, by hand or by rules. Show one on your website with a Featured collection or a Collection list section.
            </Empty>
          ) : (
            <ul className="divide-y divide-[#f1f2f4]">
              {(list ?? []).map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setEditing(c)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#fafafb]">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#f1f2f4]">
                      <Layers className="h-4 w-4 text-[#6b7280]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{c.title}</span>
                      <span className="block truncate text-[12.5px] text-[#6b7280]">
                        {c.productIds.length} {c.productIds.length === 1 ? "product" : "products"} · {c.kind === "smart" ? `${c.rules.length} ${c.rules.length === 1 ? "rule" : "rules"}` : "Picked by hand"}
                      </span>
                    </span>
                    {c.published ? <Pill tone="green">Published</Pill> : <Pill tone="gray">Hidden</Pill>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {editing ? (
        <CollectionEditor
          initial={editing === "new" ? null : editing}
          products={products}
          onClose={() => setEditing(null)}
          onSaved={(c) => {
            setList(c)
            setEditing(null)
          }}
        />
      ) : null}
    </div>
  )
}

function CollectionEditor({ initial, products, onClose, onSaved }: { initial: Collection | null; products: Product[]; onClose: () => void; onSaved: (c: Collection[]) => void }) {
  const [title, setTitle] = React.useState(initial?.title ?? "")
  const [description, setDescription] = React.useState(initial?.description ?? "")
  const [kind, setKind] = React.useState<"manual" | "smart">(initial?.kind ?? "manual")
  const [rules, setRules] = React.useState<CollectionRule[]>(initial?.rules.length ? initial.rules : [{ field: "type", op: "equals", value: "" }])
  const [match, setMatch] = React.useState<"all" | "any">(initial?.match ?? "all")
  const [sort, setSort] = React.useState(initial?.sort ?? "manual")
  const [published, setPublished] = React.useState(initial?.published ?? true)
  const [picked, setPicked] = React.useState<string[]>(initial?.kind === "manual" ? initial.productIds : [])
  const [query, setQuery] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const physical = usePhysicalCommerceEnabled()
  const ruleFields = RULE_FIELDS.filter((f) => physical || !PHYSICAL_RULES.has(f) || rules.some((r) => r.field === f))
  const q = query.trim().toLowerCase()
  const save = async () => {
    setBusy(true)
    setError(null)
    const body = { title, description, kind, rules: rules.filter((r) => r.value.trim()), match, sort, published, productIds: picked }
    const r = await api<{ collections: Collection[] }>(initial ? `/api/collections/${initial.id}` : "/api/collections", { method: initial ? "PUT" : "POST", body })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    onSaved(r.data.collections)
  }
  const remove = async () => {
    if (!initial || !window.confirm(`Delete ${initial.title}? The products stay.`)) return
    const r = await api<{ collections: Collection[] }>(`/api/collections/${initial.id}`, { method: "DELETE" })
    if (!r.ok) return setError(r.error)
    onSaved(r.data.collections)
  }
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={initial ? "Edit collection" : "New collection"}
      footer={
        <>
          {initial ? (
            <button type="button" className={cn(BTN_DANGER, "mr-auto")} onClick={remove}>
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          ) : null}
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={BTN_PRIMARY} onClick={save} disabled={busy || !title.trim()}>
            {busy ? "Saving" : "Save"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title">
          <TextInput value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Summer collection" />
        </Field>
        <Field label="Description" hint="Optional, shown on the collection's page">
          <textarea value={description} maxLength={5000} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-[14px] text-[#1a1a2e] outline-none focus:border-[#9ca3af] focus:ring-[3px] focus:ring-[rgba(17,24,39,0.06)]" />
        </Field>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#f1f2f4] p-1">
          {(
            [
              ["manual", "Pick products"],
              ["smart", "Match by rules"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={cn("h-9 rounded-lg text-[13.5px] font-medium", kind === k ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#6b7280]")}>
              {label}
            </button>
          ))}
        </div>
        {kind === "smart" ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[13.5px] text-[#374151]">
              Products must match
              <SelectInput value={match} onChange={(v) => setMatch(v as "all" | "any")} className="w-[150px]">
                <option value="all">all conditions</option>
                <option value="any">any condition</option>
              </SelectInput>
            </div>
            {rules.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                <SelectInput value={r.field} onChange={(v) => setRules((x) => x.map((y, j) => (j === i ? { ...y, field: v as RuleField } : y)))} aria-label="Field">
                  {ruleFields.map((f) => (
                    <option key={f} value={f}>
                      {RULE_FIELD_LABEL[f]}
                    </option>
                  ))}
                </SelectInput>
                <SelectInput value={r.op} onChange={(v) => setRules((x) => x.map((y, j) => (j === i ? { ...y, op: v as RuleOp } : y)))} aria-label="Condition">
                  {RULE_OPS.filter((o) => (["price", "compare_at_price", "inventory", "weight"].includes(r.field) ? ["equals", "not_equals", "greater_than", "less_than"].includes(o) : !["greater_than", "less_than"].includes(o))).map((o) => (
                    <option key={o} value={o}>
                      {RULE_OP_LABEL[o]}
                    </option>
                  ))}
                </SelectInput>
                {r.field === "type" && ["equals", "not_equals"].includes(r.op) ? (
                  <SelectInput value={r.value} onChange={(v) => setRules((x) => x.map((y, j) => (j === i ? { ...y, value: v } : y)))} aria-label="Value">
                    <option value="">Choose a kind</option>
                    {PRODUCT_KINDS.filter(([k]) => physical || k !== "physical" || r.value === k).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </SelectInput>
                ) : (
                  <TextInput value={r.value} onChange={(e) => setRules((x) => x.map((y, j) => (j === i ? { ...y, value: e.target.value } : y)))} aria-label="Value" placeholder={r.field === "price" || r.field === "compare_at_price" ? "30" : "summer"} />
                )}
                <button type="button" className={cn(BTN_GHOST, "w-10 px-0")} aria-label="Remove condition" onClick={() => setRules((x) => x.filter((_, j) => j !== i))}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            {rules.length < 20 ? (
              <button type="button" className={BTN_GHOST} onClick={() => setRules((x) => [...x, { field: "type", op: "equals", value: "" }])}>
                <Plus className="h-4 w-4" />
                Add condition
              </button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
              <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" className="pl-9" />
            </div>
            <ul className="max-h-[320px] divide-y divide-[#f1f2f4] overflow-y-auto rounded-xl border border-[#eceef1]">
              {products
                .filter((p) => !q || p.title.toLowerCase().includes(q))
                .map((p) => {
                  const on = picked.includes(p.id)
                  return (
                    <li key={p.id}>
                      <button type="button" onClick={() => setPicked((x) => (on ? x.filter((y) => y !== p.id) : [...x, p.id]))} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[#fafafb]">
                        <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded border", on ? "border-[#1a1a2e] bg-[#1a1a2e]" : "border-[#d1d5db]")}>{on ? <Check className="h-3 w-3 text-white" strokeWidth={3} /> : null}</span>
                        {p.thumbnail_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.thumbnail_url} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover ring-1 ring-black/5" loading="lazy" />
                        ) : (
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[#f1f2f4]">
                            <Layers className="h-3.5 w-3.5 text-[#9ca3af]" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] text-[#1a1a2e]">{p.title}</span>
                          <span className="block truncate text-[12px] text-[#6b7280]">{KIND_LABEL[p.type] ?? "Product"}</span>
                        </span>
                        {p.status !== "published" ? <Pill tone="gray">Draft</Pill> : null}
                      </button>
                    </li>
                  )
                })}
            </ul>
            <p className="text-[12.5px] text-[#6b7280]">{picked.length} selected</p>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sort products by">
            <SelectInput value={sort} onChange={setSort}>
              {SORTS.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </SelectInput>
          </Field>
          <div className="flex items-end pb-1">
            <Toggle label="Published" description="Can be shown on your website" checked={published} onChange={setPublished} />
          </div>
        </div>
        {error ? <Notice>{error}</Notice> : null}
      </div>
    </Modal>
  )
}
