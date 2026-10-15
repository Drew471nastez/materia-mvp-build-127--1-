"use client"

/**
 * ===========================================================================
 *  CLASSROOM
 * ===========================================================================
 * The creator's own course products, attached to the community: members
 * take them inside the community with the course player they already know
 * (the member side is /community/<slug>/classroom). Here: add a course you
 * already sell, make a new one in the product editor, set who can see each
 * one and how many days after joining it opens, put them in order, take one
 * out (the product itself is untouched).
 *
 * Round 31: a course's row opens its settings wherever it is pressed (who
 * can see it, when it opens), the menu keeps the rest; on a phone the
 * settings and Add a course are the New post sheet (form-sheet.tsx).
 */
import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { GraduationCap, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { StatusBadge } from "@/app/app/orders/order-parts"
import type { AccessRuleJson } from "@/lib/communities/types"
import type { ActionMenuItem } from "@/components/ui/responsive-action-menu"
import type { CommunityHead, CourseView, PickProduct, RuleOptions } from "./view-types"
import { AccessEditor, describeRule } from "./access-editor"
import { Confirm, Empty, ListCard, ListNote, Notice, RowMenu, buttonPrimary, buttonSecondary, errorText, field, label, send, useToast } from "./parts"
import { FormSheet } from "./form-sheet"
import { ROW_PRESS, RowControls, RowOpen, rowPress } from "./rows"
import { tt } from "@/lib/i18n/text"

const NEW_COURSE = "/app/products/new?type=course"

export function ClassroomSection({ head, initial, options }: { head: CommunityHead; initial: { attached: CourseView[]; available: PickProduct[] }; options: RuleOptions }) {
  const router = useRouter()
  const toast = useToast()
  const base = `/api/app/community/${head.id}/classroom`
  const [data, setData] = React.useState(initial)
  const [adding, setAdding] = React.useState(false)
  const [editing, setEditing] = React.useState<{ course: CourseView; access: AccessRuleJson; drip: string } | null>(null)
  const [removing, setRemoving] = React.useState<CourseView | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const reload = async () => {
    const res = await send<{ attached: CourseView[]; available: PickProduct[] }>(base, "GET")
    if (res.ok) setData({ attached: res.data.attached ?? [], available: res.data.available ?? [] })
  }

  const attach = async (p: PickProduct) => {
    setBusy(p.id)
    const res = await send(base, "POST", { productId: p.id })
    setBusy(null)
    if (!res.ok) return toast(errorText(res.data.error))
    toast(tt("{title} added", { title: p.title }))
    await reload()
    router.refresh()
  }

  const move = async (i: number, by: -1 | 1) => {
    const next = [...data.attached]
    const [c] = next.splice(i, 1)
    next.splice(i + by, 0, c)
    setData((x) => ({ ...x, attached: next }))
    const res = await send(base, "PUT", { ids: next.map((x) => x.productId) })
    if (!res.ok) {
      toast(errorText(res.data.error, tt("The order was not saved.")))
      await reload()
    }
  }

  const saveEdit = async () => {
    if (!editing) return
    setBusy("edit")
    setError(null)
    const res = await send(`${base}/${editing.course.productId}`, "PATCH", { access: editing.access, dripDays: editing.drip ? Number(editing.drip) : null })
    setBusy(null)
    if (!res.ok) return setError(errorText(res.data.error))
    setEditing(null)
    toast(tt("Saved"))
    await reload()
  }

  const detach = async () => {
    if (!removing) return
    setBusy("remove")
    const res = await send(`${base}/${removing.productId}`, "DELETE")
    setBusy(null)
    if (!res.ok) return toast(errorText(res.data.error))
    setRemoving(null)
    toast(tt("Taken out of the classroom"))
    await reload()
  }

  const settle = (c: CourseView) => {
    setError(null)
    setEditing({ course: c, access: c.access, drip: c.dripDays ? String(c.dripDays) : "" })
  }

  const menu = (c: CourseView, i: number): ActionMenuItem[] => {
    const items: ActionMenuItem[] = [
      { label: tt("Who can see it"), onClick: () => settle(c) },
      { label: tt("Edit the course"), href: `/app/products/${c.productId}` },
    ]
    if (i > 0) items.push({ label: tt("Move up"), onClick: () => void move(i, -1), separatorBefore: true })
    if (i < data.attached.length - 1) items.push({ label: tt("Move down"), onClick: () => void move(i, 1), separatorBefore: i === 0 })
    items.push({ label: tt("Take out of the classroom"), variant: "destructive", onClick: () => setRemoving(c), separatorBefore: true })
    return items
  }

  return (
    <div className="space-y-4" data-classroom="">
      <ListCard
        head={
          <ListNote>
            {tt("{n, plural, one {# course} other {# courses}}", { n: data.attached.length })}
            <span className="max-sm:hidden"> {tt("members take inside the community")}</span>
          </ListNote>
        }
        actions={
          <>
            <Link href={NEW_COURSE} className={cn(buttonSecondary, "max-sm:hidden")}>
              {tt("New course")}
            </Link>
            <button type="button" onClick={() => setAdding(true)} className={buttonPrimary} data-course-add="">
              <Plus aria-hidden className="h-4 w-4" />
              {tt("Add a course")}
            </button>
          </>
        }
      >
        {data.attached.length === 0 ? (
          <Empty icon={GraduationCap} title={tt("No courses yet.")} detail={tt("Add a course you already sell, or make a new one. Members open it here without buying it separately.")}>
            <button type="button" onClick={() => setAdding(true)} className={cn(buttonPrimary, "h-10 px-4")}>
              {tt("Add a course")}
            </button>
            <Link href={NEW_COURSE} className={cn(buttonSecondary, "h-10 px-4")}>
              {tt("New course")}
            </Link>
          </Empty>
        ) : (
          <ul className="divide-y divide-[#f1f2f4]">
            {data.attached.map((c, i) => (
              <li key={c.productId} onClick={rowPress(() => settle(c))} className={cn("flex min-h-[72px] items-center gap-3 px-4 py-3 sm:px-5", ROW_PRESS)} data-course-row="">
                {c.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.cover} alt="" className="h-12 w-[72px] shrink-0 rounded-lg object-cover" />
                ) : (
                  <span aria-hidden className="h-12 w-[72px] shrink-0 rounded-lg bg-[#eceef1]" />
                )}
                <RowOpen label={tt("Who can see {title}", { title: c.title })} className="flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[14.5px] font-medium text-[#1a1a2e]">{c.title}</span>
                    {c.status !== "published" ? <StatusBadge tone="attention">{c.status === "draft" ? tt("Draft") : tt("Not on sale")}</StatusBadge> : null}
                  </span>
                  <span className="block truncate text-[12.5px] text-[#6b7280]">{[describeRule(c.access, options), c.dripDays ? tt("opens {dripDays, plural, one {# day} other {# days}} after joining", { dripDays: c.dripDays }) : null].filter(Boolean).join(" · ")}</span>
                </RowOpen>
                <RowControls>
                  <RowMenu items={menu(c, i)} label={tt("Actions for {title}", { title: c.title })} />
                </RowControls>
              </li>
            ))}
          </ul>
        )}
      </ListCard>
      {data.attached.some((c) => c.status === "draft") ? <Notice tone="warn">{tt("A draft course is not ready for members yet. Publish it in the product editor first.")}</Notice> : null}

      <FormSheet open={adding} onClose={() => setAdding(false)} title={tt("Add a course")} name="course-add" cancelLabel={tt("Close")}>
        {data.available.length === 0 ? (
          <p className="text-[13.5px] leading-relaxed text-[#6b7280]">{tt("Every course you have is already in the classroom. Make a new one in the product editor.")}</p>
        ) : (
          <ul className="-mx-1.5 space-y-0.5">
            {data.available.map((p) => (
              <li key={p.id} className="flex min-h-12 items-center gap-3 rounded-lg px-1.5 py-1 hover:bg-[#f7f7f8]">
                {p.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.cover} alt="" className="h-9 w-12 shrink-0 rounded-md object-cover" />
                ) : (
                  <span aria-hidden className="h-9 w-12 shrink-0 rounded-md bg-[#eceef1]" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-[#1a1a2e]">{p.title}</span>
                  {p.status !== "published" ? <span className="block text-[12px] text-[#9ca3af]">{tt("Draft")}</span> : null}
                </span>
                <button type="button" onClick={() => void attach(p)} disabled={busy === p.id} className={cn(buttonSecondary, "h-10 sm:h-8")}>
                  {busy === p.id ? tt("Adding") : tt("Add")}
                </button>
              </li>
            ))}
          </ul>
        )}
        <Link href={NEW_COURSE} className={cn(buttonSecondary, "mt-4 h-10 w-full px-4 sm:h-9 sm:w-auto")} data-course-new="">
          {tt("Make a new course")}
        </Link>
      </FormSheet>

      <FormSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? editing.course.title : tt("Course")}
        name="course"
        action={{ label: tt("Save"), busyLabel: tt("Saving"), busy: busy === "edit", onClick: () => void saveEdit(), data: { "data-course-save": "" } }}
      >
        {editing ? (
          <div className="space-y-4">
            {error ? <Notice>{error}</Notice> : null}
            <AccessEditor value={editing.access} onChange={(v) => setEditing({ ...editing, access: v })} options={options} idPrefix="course" />
            <div>
              <label htmlFor="course-drip" className={label}>
                {tt("Opens after joining")}
              </label>
              <div className="flex items-center gap-2">
                <input id="course-drip" inputMode="numeric" value={editing.drip} onChange={(e) => setEditing({ ...editing, drip: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="0" className={cn(field, "h-11 w-24 tabular-nums sm:h-10")} />
                <span className="text-[13.5px] text-[#4b5563]">{tt("days")}</span>
              </div>
              <p className="mt-1 text-[12.5px] text-[#6b7280]">{tt("Leave empty to open it on the day they join.")}</p>
            </div>
          </div>
        ) : null}
      </FormSheet>

      <Confirm open={removing !== null} onClose={() => setRemoving(null)} title={tt("Take {value} out?", { value: removing?.title ?? tt("this course") })} detail={tt("Members stop seeing it in the classroom. The course and its buyers are not touched.")} action="Take out" danger busy={busy === "remove"} onConfirm={() => void detach()} />
    </div>
  )
}
