"use client"

import { displayEmail } from "@/lib/businesses/email-alias"
import * as React from "react"

import type { CreatorDetailPayload, CreatorRow, CreatorsPayload, OrderRow, OrdersPayload, PayoutRow, PayoutsPayload, ProductRow, ProductsPayload, StripeState } from "@/lib/admin/types"

import type { Action } from "./actions"
import { ago, date, money, num, short, statusWord } from "./format"
import type { Route } from "./nav-state"
import { ActivityFeed, ActivityLine, CreatorActivityPanel, OnlineList, useOnlineActivity } from "./panel-activity"
import { PlanPanel } from "./panel-plan"
import { ViewHeader } from "./shell"
import { Button, DataList, Facts, Figures, Filters, LinkText, Pager, Panel, ReadNotes, SearchField, Status, Toolbar, reasonFor, type Column } from "./ui"

type Go = (r: Partial<Route>) => void
/** `live`: the visitors-now figure the shell already polls (console.tsx), passed down rather than read twice. */
type Common = { route: Route; go: Go; query: string; onQuery: (q: string) => void; act: (a: Action) => void; live?: number | null }

const STRIPE_WORD: Record<StripeState, string> = { ready: "Ready", restricted: "Incomplete", pending: "Started", none: "Not connected" }

function Unread({ reason }: { reason: string | null }) {
  return <p className="px-4 py-6 text-[13px] text-[#9b9ba6]">Could not be read. {reason}</p>
}

/* ── Creators ─────────────────────────────────────────────────────────── */

export function CreatorsView({ data, route, go, query, onQuery, live }: Common & { data: CreatorsPayload }) {
  const list = data.list
  /* Who is online and the line's counts, every 30 seconds while visible (panel-activity). */
  const online = useOnlineActivity()
  const onlineCount = online.data?.summary?.onlineNow
  const columns: Column<CreatorRow>[] = [
    { key: "name", label: "Creator", width: "minmax(0,1.6fr)", phone: "primary", render: (c) => c.name },
    { key: "handle", label: "Handle", width: "minmax(0,1.2fr)", render: (c) => (c.handle ? `@${c.handle}` : "No handle") },
    { key: "stripe", label: "Stripe", width: "118px", render: (c) => <Status value={c.stripe === "ready" ? "ready" : c.stripe === "none" ? null : "restricted"} label={STRIPE_WORD[c.stripe]} /> },
    { key: "state", label: "State", width: "96px", render: (c) => (c.banned ? <Status value="banned" /> : <Status value={c.storePublished ? "published" : "draft"} label={c.storePublished ? "Open" : "Closed"} />) },
    { key: "published", label: "Products", width: "80px", align: "right", phone: "hide", render: (c) => num(c.published) },
    { key: "orders", label: "Orders", width: "72px", align: "right", phone: "hide", render: (c) => num(c.orders) },
    { key: "gross", label: "Sales", width: "96px", align: "right", phone: "end", render: (c) => (c.gross === null ? "" : money(c.gross)) },
    { key: "joined", label: "Joined", width: "100px", align: "right", render: (c) => date(c.joined) },
  ]
  return (
    <div className="space-y-4">
      <ViewHeader title="Creators" meta={list ? `${num(list.total)} ${route.filter && route.filter !== "all" ? "match" : "in all"}` : undefined} />
      <ActivityLine data={online.data} live={live} />
      <Filters
        label="Creators view"
        value={route.tab || "list"}
        onChange={(t) => go({ tab: t === "list" ? "" : t })}
        options={[
          { id: "list", label: "All creators" },
          { id: "online", label: typeof onlineCount === "number" ? `Online now, ${num(onlineCount)}` : "Online now" },
          { id: "activity", label: "Activity" },
        ]}
      />
      {route.tab === "online" ? (
        <OnlineList data={online.data} error={online.error} go={go} />
      ) : route.tab === "activity" ? (
        <ActivityFeed go={go} />
      ) : (
      <>
      <ReadNotes problems={data.problems} notices={data.notices} />
      <Toolbar>
        <SearchField label="Search creators" value={query} onChange={onQuery} placeholder="Handle, name or id" />
        <Filters
          label="Filter creators"
          value={(data.filter || "all") as string}
          onChange={(f) => go({ filter: f === "all" ? "" : f, page: 1 })}
          options={[
            { id: "all", label: "All" },
            { id: "ready", label: "Stripe ready" },
            { id: "restricted", label: "Stripe incomplete" },
            { id: "none", label: "No Stripe" },
            { id: "banned", label: "Banned" },
          ]}
        />
      </Toolbar>
      <Panel>
        {list ? (
          <>
            <DataList label="Creators" columns={columns} rows={list.rows} rowKey={(c) => c.id} empty={data.q ? "No creator matches that." : "No creators here."} onOpen={(c) => go({ view: "creator", id: c.id, q: "", filter: "", page: 1 })} />
            <Pager page={list.page} pages={list.pages} total={list.total} onPage={(page) => go({ page })} />
          </>
        ) : (
          <Unread reason={reasonFor(data.problems, "creators")} />
        )}
      </Panel>
      </>
      )}
    </div>
  )
}

export function CreatorView({ data, go, act }: Common & { data: CreatorDetailPayload }) {
  const c = data.creator
  const back = { label: "Creators", onClick: () => go({ view: "creators", id: "", page: 1 }) }
  if (!c) {
    return (
      <div className="space-y-4">
        <ViewHeader title="Creator" back={back} />
        <ReadNotes problems={data.problems} notices={data.notices} />
        <Panel>
          <p className="px-4 py-6 text-[13px] text-[#9b9ba6]">{reasonFor(data.problems, "creator") ? `Could not be read. ${reasonFor(data.problems, "creator")}` : "No creator has this id."}</p>
        </Panel>
      </div>
    )
  }
  const label = c.handle ? `@${c.handle}` : c.name
  const p = data.problems
  return (
    <div className="space-y-4">
      <ViewHeader
        title={c.name}
        back={back}
        meta={[c.handle ? `@${c.handle}` : null, c.joined ? `joined ${date(c.joined)}` : null, displayEmail(c.email)].filter(Boolean).join(" · ")}
        actions={
          <>
            {c.handle ? (
              <a href={`/${c.handle}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-[7px] border border-white/[0.1] bg-[#17171d] px-3 text-[13px] font-medium text-[#ededf0] hover:bg-[#1d1d24]">
                Open storefront
              </a>
            ) : null}
            {c.bansReadable ? (
              c.bannedAt ? (
                <Button onClick={() => act({ kind: "unban", creatorId: c.id, label })}>Lift ban</Button>
              ) : (
                <Button variant="danger" onClick={() => act({ kind: "ban", creatorId: c.id, label })}>
                  Ban
                </Button>
              )
            ) : null}
          </>
        }
      />
      <ReadNotes problems={p} notices={data.notices} />
      {c.bannedAt ? (
        <p className="rounded-[10px] border border-[#f47067]/40 px-4 py-2.5 text-[13px] text-[#ededf0]">
          Banned {date(c.bannedAt)}{c.bannedReason ? `: ${c.bannedReason}` : "."}
        </p>
      ) : null}
      {!c.bansReadable ? (
        <p className="rounded-[10px] border border-white/[0.1] px-4 py-2.5 text-[12px] text-[#9b9ba6]">Banning needs supabase/sql/RUN_ADMIN_CONSOLE.sql to be run first.</p>
      ) : null}

      <Figures
        items={[
          { label: "Sales, all time", value: data.sales ? money(data.sales.gross) : "", sub: data.sales ? `${num(data.sales.orders)} orders` : undefined, unreadable: data.sales ? null : reasonFor(p, "creator sales") },
          { label: "Storelib fees", value: data.sales ? money(data.sales.fees) : "", unreadable: data.sales ? null : reasonFor(p, "creator sales") },
          { label: "Balance available", value: data.balance ? money(data.balance.available) : "", sub: data.balance ? `${money(data.balance.pending)} on hold` : undefined, unreadable: data.balance ? null : reasonFor(p, "creator balance") },
          { label: "Paid out", value: data.balance ? money(data.balance.paidOut) : "", sub: data.balance?.negative ? `${money(data.balance.negative)} owed back` : undefined, unreadable: data.balance ? null : reasonFor(p, "creator balance") },
        ]}
      />

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Panel title="Stripe">
          <Facts
            items={[
              { label: "State", value: <Status value={c.stripe === "ready" ? "ready" : c.stripe === "none" ? null : "restricted"} label={STRIPE_WORD[c.stripe]} /> },
              { label: "Account", value: c.stripeAccount ?? "None" },
              { label: "Can take payments", value: c.chargesEnabled ? "Yes" : "No" },
              { label: "Can be paid out", value: c.payoutsEnabled ? "Yes" : "No" },
              { label: "Details sent", value: c.detailsSubmitted ? "Yes" : "No" },
            ]}
          />
        </Panel>
        <Panel title="Account">
          <Facts
            items={[
              { label: "Storefront", value: c.storePublished ? "Open" : "Closed" },
              { label: "Spam review", value: statusWord(c.spamState) || "Not reviewed" },
              { label: "Creator id", value: short(c.id) },
              { label: "User id", value: c.userId ? short(c.userId) : "None" },
            ]}
          />
        </Panel>
      </div>

      <CreatorActivityPanel creatorId={c.id} />

      <PlanPanel creatorId={c.id} />

      <Panel title="Products" meta={data.products ? `${num(data.products.length)}${data.products.length === 50 ? " newest" : ""}` : undefined}>
        {data.products ? (
          <DataList
            label="Products"
            rows={data.products}
            rowKey={(r) => r.id}
            empty="No products."
            columns={[
              { key: "title", label: "Product", width: "minmax(0,2fr)", phone: "primary", render: (r) => r.title },
              { key: "status", label: "Status", width: "110px", render: (r) => <Status value={r.status} /> },
              { key: "price", label: "Price", width: "90px", align: "right", render: (r) => money(r.price) },
              { key: "sales", label: "Sold", width: "70px", align: "right", phone: "end", render: (r) => num(r.sales) },
              {
                key: "act",
                label: "",
                width: "150px",
                align: "right",
                render: (r) =>
                  r.status === "published" ? (
                    <Button variant="quiet" className="h-7" onClick={() => act({ kind: "unpublish", productId: r.id, label: r.title })}>Take off sale</Button>
                  ) : r.status === "unpublished" ? (
                    <Button variant="quiet" className="h-7" onClick={() => act({ kind: "republish", productId: r.id, label: r.title })}>Put back</Button>
                  ) : null,
              },
            ]}
          />
        ) : (
          <Unread reason={reasonFor(p, "creator products")} />
        )}
      </Panel>

      <Panel title="Recent orders">
        {data.orders ? <OrderList rows={data.orders} act={act} go={go} empty="No orders." showCreator={false} /> : <Unread reason={reasonFor(p, "creator orders")} />}
      </Panel>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Panel title="Payouts">
          {data.payouts ? <PayoutList rows={data.payouts} go={go} showCreator={false} /> : <Unread reason={reasonFor(p, "creator payouts")} />}
        </Panel>
        <Panel title="Websites">
          {data.sites ? (
            <DataList
              label="Websites"
              rows={data.sites}
              rowKey={(r) => r.id}
              empty="No websites."
              columns={[
                { key: "name", label: "Website", width: "minmax(0,2fr)", phone: "primary", render: (r) => r.name },
                { key: "status", label: "Status", width: "110px", render: (r) => <Status value={r.status} /> },
                { key: "at", label: "Published", width: "110px", align: "right", render: (r) => date(r.publishedAt) },
              ]}
            />
          ) : (
            <Unread reason={reasonFor(p, "creator websites")} />
          )}
        </Panel>
      </div>

      <Panel title="Admin history">
        {data.history ? (
          <DataList
            label="Admin history"
            rows={data.history}
            rowKey={(r) => r.id}
            empty="Nothing has been done to this creator from the admin."
            columns={[
              { key: "action", label: "Action", width: "minmax(0,1fr)", phone: "primary", render: (r) => statusWord(r.action) },
              { key: "reason", label: "Reason", width: "minmax(0,2fr)", render: (r) => r.reason ?? "" },
              { key: "at", label: "When", width: "110px", align: "right", phone: "end", render: (r) => ago(r.at) },
            ]}
          />
        ) : (
          <Unread reason={reasonFor(p, "creator history")} />
        )}
      </Panel>
    </div>
  )
}

/* ── Products ─────────────────────────────────────────────────────────── */

export function ProductsView({ data, route, go, query, onQuery, act }: Common & { data: ProductsPayload }) {
  const list = data.list
  const columns: Column<ProductRow>[] = [
    { key: "title", label: "Product", width: "minmax(0,2fr)", phone: "primary", render: (p) => p.title },
    {
      key: "creator",
      label: "Creator",
      width: "minmax(0,1.1fr)",
      render: (p) => (p.creator ? <LinkText onClick={() => go({ view: "creator", id: p.creator!.id, q: "", filter: "", page: 1 })}>@{p.creator.handle || short(p.creator.id)}</LinkText> : ""),
    },
    { key: "status", label: "Status", width: "112px", render: (p) => <Status value={p.archived ? "draft" : p.status} label={p.archived ? "Archived" : undefined} /> },
    {
      key: "flag",
      label: "Signals",
      width: "minmax(0,1.3fr)",
      render: (p) => (p.flag ? <span className="text-[#d4a72c]" title={p.flag.reasons.join(", ")}>Score {p.flag.score}: {p.flag.reasons[0]}</span> : <span className="text-[#6b6b76]">None</span>),
    },
    { key: "price", label: "Price", width: "84px", align: "right", phone: "end", render: (p) => money(p.price) },
    { key: "sales", label: "Sold", width: "60px", align: "right", phone: "hide", render: (p) => num(p.sales) },
    {
      key: "act",
      label: "",
      width: "130px",
      align: "right",
      phone: "secondary",
      render: (p) =>
        p.status === "published" ? (
          <Button variant="quiet" className="h-7" onClick={(e) => { e.stopPropagation(); act({ kind: "unpublish", productId: p.id, label: p.title }) }}>Take off sale</Button>
        ) : p.status === "unpublished" ? (
          <Button variant="quiet" className="h-7" onClick={(e) => { e.stopPropagation(); act({ kind: "republish", productId: p.id, label: p.title }) }}>Put back</Button>
        ) : null,
    },
  ]
  return (
    <div className="space-y-4">
      <ViewHeader
        title="Products"
        meta={list ? (data.filter === "flagged" ? `${num(list.total)} flagged among the newest ${num(data.scanned)}` : `${num(list.total)} ${route.filter ? "match" : "in all"}`) : undefined}
      />
      <ReadNotes problems={data.problems} notices={data.notices} />
      <Toolbar>
        <SearchField label="Search products" value={query} onChange={onQuery} placeholder="Title, slug or id" />
        <Filters
          label="Filter products"
          value={(data.filter || "all") as string}
          onChange={(f) => go({ filter: f === "all" ? "" : f, page: 1 })}
          options={[
            { id: "all", label: "All" },
            { id: "published", label: "Published" },
            { id: "draft", label: "Draft" },
            { id: "unpublished", label: "Taken down" },
            { id: "flagged", label: "Spam signals" },
          ]}
        />
      </Toolbar>
      <Panel>
        {list ? (
          <>
            <DataList
              label="Products"
              columns={columns}
              rows={list.rows}
              rowKey={(p) => p.id}
              empty={data.filter === "flagged" ? "No product among the newest trips the spam signals." : data.q ? "No product matches that." : "No products here."}
              onOpen={(p) => (p.creator ? go({ view: "creator", id: p.creator.id, q: "", filter: "", page: 1 }) : undefined)}
            />
            <Pager page={list.page} pages={list.pages} total={list.total} onPage={(page) => go({ page })} />
          </>
        ) : (
          <Unread reason={reasonFor(data.problems, "products", "flagged products")} />
        )}
      </Panel>
    </div>
  )
}

/* ── Orders ───────────────────────────────────────────────────────────── */

function OrderList({ rows, act, go, empty, showCreator = true }: { rows: OrderRow[]; act: (a: Action) => void; go: Go; empty: string; showCreator?: boolean }) {
  const columns: Column<OrderRow>[] = [
    { key: "product", label: "Product", width: "minmax(0,1.6fr)", phone: "primary", render: (o) => o.product?.title ?? "Deleted product" },
    ...(showCreator
      ? [{ key: "creator", label: "Creator", width: "minmax(0,1fr)", render: (o: OrderRow) => (o.creator ? <LinkText onClick={() => go({ view: "creator", id: o.creator!.id, q: "", filter: "", page: 1 })}>@{o.creator.handle || short(o.creator.id)}</LinkText> : "") } as Column<OrderRow>]
      : []),
    { key: "buyer", label: "Buyer", width: "minmax(0,1.2fr)", render: (o) => o.buyer },
    { key: "status", label: "Status", width: "104px", render: (o) => <Status value={o.status} label={o.status === "refunded" && o.refundable > 0 ? "Part refunded" : undefined} /> },
    { key: "when", label: "When", width: "96px", align: "right", render: (o) => ago(o.created) },
    { key: "amount", label: "Amount", width: "96px", align: "right", phone: "end", render: (o) => money(o.amount, o.currency) },
    {
      key: "act",
      label: "",
      width: "84px",
      align: "right",
      phone: "secondary",
      render: (o) => (o.refundable > 0 ? <Button variant="quiet" className="h-7" onClick={(e) => { e.stopPropagation(); act({ kind: "refund", orderId: o.id, label: o.product?.title ?? `order ${short(o.id)}` }) }}>Refund</Button> : null),
    },
  ]
  return <DataList label="Orders" columns={columns} rows={rows} rowKey={(o) => o.id} empty={empty} />
}

export function OrdersView({ data, go, query, onQuery, act }: Common & { data: OrdersPayload }) {
  const list = data.list
  const s = data.statuses
  const by = (k: string) => s?.find((x) => x.status === k)
  const unread = s ? null : reasonFor(data.problems, "orders by status")
  return (
    <div className="space-y-4">
      <ViewHeader title="Orders and payments" meta="Search by order id, Stripe payment id, or the buyer's whole email address." />
      <ReadNotes problems={data.problems} notices={data.notices} />
      <Figures
        items={[
          { label: "Paid, 30 days", value: num(by("completed")?.orders ?? 0), sub: money(by("completed")?.gross ?? 0), unreadable: unread },
          { label: "Failed, 30 days", value: num(by("failed")?.orders ?? 0), sub: "not paid", unreadable: unread },
          { label: "Refunded, 30 days", value: num(by("refunded")?.orders ?? 0), sub: money(by("refunded")?.gross ?? 0), unreadable: unread },
          { label: "In dispute, 30 days", value: num(by("disputed")?.orders ?? 0), sub: money(by("disputed")?.gross ?? 0), unreadable: unread },
        ]}
      />
      <Toolbar>
        <SearchField label="Find an order" value={query} onChange={onQuery} placeholder="Order id, pi_…, or email" />
        <Filters
          label="Filter orders"
          value={(data.filter || "all") as string}
          onChange={(f) => go({ filter: f === "all" ? "" : f, page: 1 })}
          options={[
            { id: "all", label: "All" },
            { id: "completed", label: "Paid" },
            { id: "pending", label: "Pending" },
            { id: "failed", label: "Failed" },
            { id: "refunded", label: "Refunded" },
            { id: "disputed", label: "Disputed" },
          ]}
        />
      </Toolbar>
      <Panel>
        {list ? (
          <>
            <OrderList rows={list.rows} act={act} go={go} empty={data.q ? "No order matches that. Search takes a whole id or a whole address." : "No orders here."} />
            <Pager page={list.page} pages={list.pages} total={list.total} onPage={(page) => go({ page })} />
          </>
        ) : (
          <Unread reason={reasonFor(data.problems, "orders")} />
        )}
      </Panel>
    </div>
  )
}

/* ── Payouts and ledger ───────────────────────────────────────────────── */

function PayoutList({ rows, go, showCreator = true }: { rows: PayoutRow[]; go: Go; showCreator?: boolean }) {
  const columns: Column<PayoutRow>[] = [
    ...(showCreator
      ? [{ key: "creator", label: "Creator", width: "minmax(0,1.2fr)", phone: "primary", render: (p: PayoutRow) => (p.creator ? <LinkText onClick={() => go({ view: "creator", id: p.creator!.id, q: "", filter: "", page: 1 })}>@{p.creator.handle || short(p.creator.id)}</LinkText> : "") } as Column<PayoutRow>]
      : []),
    { key: "status", label: "Status", width: "112px", phone: showCreator ? "secondary" : "primary", render: (p) => <Status value={p.status} /> },
    { key: "failure", label: "Reason", width: "minmax(0,1.4fr)", render: (p) => p.failure ?? "" },
    { key: "when", label: "Created", width: "100px", align: "right", render: (p) => date(p.created) },
    { key: "amount", label: "Amount", width: "100px", align: "right", phone: "end", render: (p) => money(p.amount, p.currency) },
  ]
  return <DataList label="Payouts" columns={columns} rows={rows} rowKey={(p) => p.id} empty="No payouts." />
}

export function PayoutsView({ data, go }: Common & { data: PayoutsPayload }) {
  const b = data.balances
  const h = data.holds
  const p = data.problems
  return (
    <div className="space-y-4">
      <ViewHeader title="Payouts and ledger" meta="What creators are owed, what is held, and what went out." />
      <ReadNotes problems={p} notices={data.notices} />
      <Figures
        items={[
          { label: "Available to creators", value: b ? money(b.available) : "", sub: b ? `${num(b.ledgers)} balances${b.partial ? ", first 5,000" : ""}` : undefined, unreadable: b ? null : reasonFor(p, "balances") },
          { label: "On hold", value: h ? money(h.cents) : "", sub: h ? `${num(h.count)} sales` : undefined, unreadable: h ? null : reasonFor(p, "holds", "overdue holds") },
          { label: "Past release date", value: h ? num(h.overdue) : "", sub: "sales held over 2 days late", unreadable: h ? null : reasonFor(p, "holds", "overdue holds") },
          { label: "In transit", value: b ? money(b.inTransit) : "", sub: b?.negative ? `${money(b.negative)} owed back` : undefined, unreadable: b ? null : reasonFor(p, "balances") },
        ]}
      />
      <Filters
        label="Filter payouts"
        value={(data.filter || "all") as string}
        onChange={(f) => go({ filter: f === "all" ? "" : f, page: 1 })}
        options={[
          { id: "all", label: "All" },
          { id: "paid", label: "Paid" },
          { id: "pending", label: "Pending" },
          { id: "in_transit", label: "In transit" },
          { id: "failed", label: "Failed" },
          { id: "canceled", label: "Canceled" },
        ]}
      />
      <Panel title="Payouts">
        {data.list ? (
          <>
            <PayoutList rows={data.list.rows} go={go} />
            <Pager page={data.list.page} pages={data.list.pages} total={data.list.total} onPage={(page) => go({ page })} />
          </>
        ) : (
          <Unread reason={reasonFor(p, "payouts")} />
        )}
      </Panel>
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel title="Ledger" meta="Newest 20">
          {data.ledger ? (
            <DataList
              label="Ledger"
              rows={data.ledger}
              rowKey={(r) => r.id}
              empty="No ledger entries."
              columns={[
                { key: "type", label: "Entry", width: "minmax(0,1fr)", phone: "primary", render: (r) => statusWord(r.type) },
                { key: "creator", label: "Creator", width: "minmax(0,1fr)", render: (r) => (r.creator ? <LinkText onClick={() => go({ view: "creator", id: r.creator!.id, q: "", filter: "", page: 1 })}>@{r.creator.handle || short(r.creator.id)}</LinkText> : "") },
                { key: "when", label: "When", width: "96px", align: "right", render: (r) => ago(r.created) },
                { key: "amount", label: "Amount", width: "96px", align: "right", phone: "end", render: (r) => money(r.amount) },
              ]}
            />
          ) : (
            <Unread reason={reasonFor(p, "ledger")} />
          )}
        </Panel>
        <Panel title="Owed back" meta="Negative balances">
          {data.negative ? (
            <DataList
              label="Negative balances"
              rows={data.negative}
              rowKey={(r) => r.creator?.id ?? String(r.cents)}
              empty="No creator owes anything back."
              columns={[
                { key: "creator", label: "Creator", width: "minmax(0,1fr)", phone: "primary", render: (r) => (r.creator ? <LinkText onClick={() => go({ view: "creator", id: r.creator!.id, q: "", filter: "", page: 1 })}>@{r.creator.handle || short(r.creator.id)}</LinkText> : "") },
                { key: "cents", label: "Owed", width: "100px", align: "right", phone: "end", render: (r) => money(r.cents) },
              ]}
            />
          ) : (
            <Unread reason={reasonFor(p, "balances")} />
          )}
        </Panel>
      </div>
    </div>
  )
}
