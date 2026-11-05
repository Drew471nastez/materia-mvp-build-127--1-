"use client"

/**
 * ===========================================================================
 *  THE PRODUCT'S QUESTIONS, IN THE ORDER A BUYER READS THEM
 * ===========================================================================
 * Each question is a card with a handle along its top. The order is changed
 * by holding the handle and moving it; nothing else on the card starts a
 * drag, so the fields are typed into as usual.
 *
 * HOW A FINGER MOVES ONE is ./hold-to-drag.ts, shared with the media grid:
 * a mouse after 4px, a finger after a 300ms hold (a swipe before then
 * scrolls the page), the keyboard with Space, the arrows and Space. It was
 * PointerSensor, which took every touch after 12px with no hold, and a
 * `touch-action: none` handle that could not be swiped to scroll. What
 * happens is read out in words, not ids.
 *
 * THE CARD UNDER THE FINGER moves by transform only, one to one with it: no
 * transition on its own transform while it is held (a `transition-all` on
 * the card used to make it trail the finger). It lifts on an inner layer,
 * a 2% scale and a soft shadow, so the lift can ease in without the card
 * lagging. The others slide out of its way on dnd-kit's 200ms transition.
 *
 * A touchcancel (a call coming in, the system taking the gesture), Escape,
 * or losing the page ends it as a cancel: the order is what it was before
 * the hold. Only a drop commits, into the form's `faqs`, which the save
 * writes as they are ordered.
 */

import * as React from "react"
import {
  DndContext,
  closestCenter,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
  type UniqueIdentifier,
} from "@dnd-kit/core"
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { GripVertical, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { FAQItem } from "./editor-form"
import { AUTO_SCROLL, HANDLE_TOUCH, liftTick, useHoldToDragSensors } from "./hold-to-drag"
import { tt } from "@/lib/i18n/text"

/** Up and down only: a question never goes sideways. */
const vertical: Modifier = ({ transform }) => ({ ...transform, x: 0 })

export function FaqList({
  faqs,
  onChange,
}: {
  faqs: FAQItem[]
  onChange: (update: (prev: FAQItem[]) => FAQItem[]) => void
}) {
  const sensors = useHoldToDragSensors()

  const [activeId, setActiveId] = React.useState<UniqueIdentifier | null>(null)

  /* Positions for the words a screen reader hears, from the order when the drag began. */
  const orderRef = React.useRef<UniqueIdentifier[]>(faqs.map((f) => f.id))
  orderRef.current = faqs.map((f) => f.id)
  const place = (id: UniqueIdentifier | undefined) => (id == null ? 0 : orderRef.current.indexOf(id) + 1)
  const count = faqs.length
  const announcements: Announcements = {
    onDragStart: ({ active }) => tt("Picked up question {id} of {count}.", { id: place(active.id), count }),
    onDragOver: ({ active, over }) =>
      over ? tt("Question {id} is now at position {id2} of {count}.", { id: place(active.id), id2: place(over.id), count }) : undefined,
    onDragEnd: ({ active, over }) =>
      over ? tt("Question {id} dropped at position {id2} of {count}.", { id: place(active.id), id2: place(over.id), count }) : tt("Question dropped where it was."),
    onDragCancel: ({ active }) => tt("Cancelled. Question {id} is back where it was.", { id: place(active.id) }),
  }

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(e.active.id)
    liftTick(e.activatorEvent)
  }
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null)
    if (!over || active.id === over.id) return
    onChange((prev) => {
      const from = prev.findIndex((f) => f.id === active.id)
      const to = prev.findIndex((f) => f.id === over.id)
      return from < 0 || to < 0 ? prev : arrayMove(prev, from, to)
    })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[vertical]}
      autoScroll={AUTO_SCROLL}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            tt("To move a question, press Space or Enter on its handle, then the up and down arrow keys. Press Space or Enter again to drop it, or Escape to put it back."),
        },
      }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={faqs.map((f) => f.id)} strategy={verticalListSortingStrategy}>
        <div data-faq-list="" data-dragging={activeId != null ? "" : undefined} className="space-y-3">
          {faqs.map((faq, i) => (
            <FaqCard
              key={faq.id}
              faq={faq}
              position={i + 1}
              onUpdate={(updates) => onChange((prev) => prev.map((f) => (f.id === faq.id ? { ...f, ...updates } : f)))}
              onRemove={faq.isDefault ? undefined : () => onChange((prev) => prev.filter((f) => f.id !== faq.id))}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

function FaqCard({
  faq,
  position,
  onUpdate,
  onRemove,
}: {
  faq: FAQItem
  position: number
  onUpdate: (updates: { question?: string; answer?: string }) => void
  onRemove?: () => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: faq.id })

  return (
    <div
      ref={setNodeRef}
      data-faq-id={faq.id}
      data-lifted={isDragging ? "" : undefined}
      className="relative"
      style={{
        /* Whole pixels on the way: a card that sits on half a pixel blurs its text. */
        transform: transform ? `translate3d(0, ${Math.round(transform.y)}px, 0)` : undefined,
        /* The held card follows the finger with nothing in between; the others slide. */
        transition: isDragging ? undefined : transition,
        zIndex: isDragging ? 20 : undefined,
      }}
    >
      <div
        data-faq-card=""
        className={cn(
          "overflow-hidden rounded-xl border bg-white transition-[scale,box-shadow,border-color] duration-150 ease-out motion-reduce:transition-none",
          isDragging
            ? "scale-[1.02] border-[#d9dbe0] shadow-[0_12px_28px_-8px_rgba(17,24,39,0.22),0_2px_6px_rgba(17,24,39,0.08)]"
            : "border-[#e5e7eb] shadow-[0_1px_0_rgba(0,0,0,0.03)]",
        )}
      >
        <div className="flex items-center border-b border-[#eef0f2] bg-[#fafbfb] pr-1">
          <button
            type="button"
            ref={setActivatorNodeRef}
            data-faq-handle=""
            {...attributes}
            {...listeners}
            aria-label={tt("Move question {position}", { position })}
            className={cn(
              "flex h-11 min-w-0 flex-1 items-center gap-2 pl-3 pr-2 text-left outline-none sm:h-10",
              HANDLE_TOUCH,
              "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8b5cf6]",
            )}
          >
            <GripVertical aria-hidden className="h-4 w-4 shrink-0 text-[#9ca3af]" />
            <span className="text-[13px] font-medium text-[#1a1a2e]">{tt("Question {position}", { position })}</span>
            <span className="ml-auto text-[12px] text-[#9ca3af] sm:hidden">{tt("Hold to drag")}</span>
          </button>
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              aria-label={tt("Remove question {position}", { position })}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[#9ca3af] transition-colors duration-100 hover:bg-[#fef1ee] hover:text-[#c4290c] active:bg-[#fde4df] sm:h-8 sm:w-8"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <div className="space-y-2.5 p-3 sm:space-y-3 sm:p-4">
          <div className="space-y-1">
            <label htmlFor={`faq-q-${faq.id}`} className="text-[12px] font-medium text-[#6b7280]">
              {tt("Question")}
            </label>
            <Input
              id={`faq-q-${faq.id}`}
              value={faq.question}
              onChange={(e) => onUpdate({ question: e.target.value })}
              className="h-10 rounded-lg border-gray-200 bg-gray-50 text-sm font-medium transition-colors focus:bg-white"
              placeholder={tt("What do buyers ask?")}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`faq-a-${faq.id}`} className="text-[12px] font-medium text-[#6b7280]">
              {tt("Answer")}
            </label>
            <Textarea
              id={`faq-a-${faq.id}`}
              value={faq.answer}
              onChange={(e) => onUpdate({ answer: e.target.value })}
              className="min-h-[60px] resize-none rounded-lg border-gray-200 bg-gray-50 text-sm transition-colors focus:bg-white sm:min-h-[70px]"
              placeholder={tt("Your answer")}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
