"use client"

/**
 * What a selection of posts can do, on a bar that stays at the foot of the
 * page while rows are picked: Publish, Unpublish, Archive, Move to category,
 * Add tag, Delete (asked first, by the list). On a phone the bar is the count
 * and one Actions button that opens the same actions in the shared sheet.
 */
import * as React from "react"
import { Archive, ArchiveRestore, FolderInput, Send, Tag, Trash2, Undo2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import type { SiteBlogCategory, SitePostStatus } from "@/lib/site-blog/types"
import { buttonClass, iconButtonClass, inputClass } from "../parts"
import type { BulkAction } from "./api"
import { BULK_MAX, bulkAvailability } from "./model"
import { BlogDialog, SelectField } from "./ui"

export function BulkBar({
  count,
  statuses,
  categories,
  tags,
  busy,
  onClear,
  onRun,
  onDelete,
}: {
  count: number
  statuses: (SitePostStatus | undefined)[]
  categories: SiteBlogCategory[]
  tags: string[]
  busy: boolean
  onClear: () => void
  onRun: (action: BulkAction, arg?: string | null) => Promise<boolean>
  onDelete: () => void
}) {
  const can = bulkAvailability(statuses)
  const [ask, setAsk] = React.useState<null | "category" | "tag">(null)
  const [categoryId, setCategoryId] = React.useState("")
  const [tag, setTag] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const tagListId = React.useId()

  const items: ActionMenuItem[] = [
    { label: tt("Publish"), icon: <Send />, onClick: () => void onRun("publish"), disabled: !can.publish || busy, id: "publish" },
    { label: tt("Unpublish"), icon: <Undo2 />, onClick: () => void onRun("unpublish"), disabled: !can.unpublish || busy, id: "unpublish" },
    can.archive || !can.unarchive
      ? { label: tt("Archive"), icon: <Archive />, onClick: () => void onRun("archive"), disabled: !can.archive || busy, id: "archive" }
      : { label: tt("Move to drafts"), icon: <ArchiveRestore />, onClick: () => void onRun("unarchive"), disabled: busy, id: "unarchive" },
    { label: tt("Move to category"), icon: <FolderInput />, onClick: () => open("category"), disabled: busy, separatorBefore: true, id: "category" },
    { label: tt("Add tag"), icon: <Tag />, onClick: () => open("tag"), disabled: busy, id: "tag" },
    { label: tt("Delete"), icon: <Trash2 />, onClick: onDelete, disabled: busy, variant: "destructive", separatorBefore: true, id: "delete" },
  ]

  function open(which: "category" | "tag") {
    setError(null)
    setAsk(which)
  }

  async function confirm() {
    setError(null)
    const ok = ask === "category" ? await onRun("set_category", categoryId || null) : await onRun("add_tag", tag.trim())
    if (ok) {
      setAsk(null)
      setTag("")
    } else setError(tt("Something went wrong. Try again."))
  }

  return (
    <>
      <div
        role="region"
        aria-label={tt("Selected posts")}
        data-blog-bulk=""
        className="wb-settings-in sticky bottom-[max(16px,calc(env(safe-area-inset-bottom)+8px))] z-20 mt-4 flex items-center gap-2 rounded-2xl border border-white/12 bg-[#1a1a1a] py-2 pl-4 pr-2 shadow-[0_18px_48px_-12px_rgba(0,0,0,0.85)]"
      >
        <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium text-white" aria-live="polite">
          {tt("{count, plural, one {# selected} other {# selected}}", { count })}
          {count > BULK_MAX && <span className="ml-2 text-[13px] font-normal text-amber-200">{tt("The first {max} are changed at a time.", { max: BULK_MAX })}</span>}
        </span>
        {/* A computer: each action its own button. */}
        <div className="hidden items-center gap-1.5 md:flex">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={item.disabled}
              onClick={item.onClick}
              data-blog-bulk-action={item.id}
              className={cn(buttonClass, "px-3 [&_svg]:h-4 [&_svg]:w-4", item.variant === "destructive" && "text-red-300")}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
        {/* A phone: the same, in the shared sheet. */}
        <div className="md:hidden">
          <ResponsiveActionMenu title={tt("{count, plural, one {# selected} other {# selected}}", { count })} items={items} trigger={<button type="button" className={buttonClass}>{tt("Actions")}</button>} />
        </div>
        <button type="button" onClick={onClear} className={iconButtonClass} aria-label={tt("Clear selection")}>
          <X className="h-4 w-4" />
        </button>
      </div>

      {ask === "category" && (
        <BlogDialog
          title={tt("Move to category")}
          lead={tt("{count, plural, one {The selected post moves to this category.} other {The # selected posts move to this category.}}", { count })}
          confirmLabel={tt("Move")}
          busyLabel={tt("Moving")}
          busy={busy}
          error={error}
          onCancel={() => setAsk(null)}
          onConfirm={() => void confirm()}
        >
          <SelectField label={tt("Category")} value={categoryId} onChange={setCategoryId} className="w-full">
            <option value="">{tt("No category")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        </BlogDialog>
      )}
      {ask === "tag" && (
        <BlogDialog
          title={tt("Add tag")}
          lead={tt("{count, plural, one {The tag is added to the selected post.} other {The tag is added to the # selected posts.}}", { count })}
          confirmLabel={tt("Add tag")}
          busyLabel={tt("Adding")}
          busy={busy}
          error={error}
          confirmDisabled={!tag.trim()}
          onCancel={() => setAsk(null)}
          onConfirm={() => void confirm()}
        >
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && tag.trim() && !busy) {
                e.preventDefault()
                void confirm()
              }
            }}
            maxLength={40}
            list={tagListId}
            placeholder={tt("Tag name")}
            aria-label={tt("Tag name")}
            className={cn(inputClass, "md:w-full")}
          />
          <datalist id={tagListId}>
            {tags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </BlogDialog>
      )}
    </>
  )
}
