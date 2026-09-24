"use client"

/**
 * ===========================================================================
 *  THE PRODUCT'S QUESTIONS, IN THE ORDER A BUYER READS THEM
 * ===========================================================================
 * Each question is a card with a handle along its top. The order is changed
 * by holding the handle and moving it; nothing else on the card starts a
 * drag, so the fields are typed into as usual.
 *
 * HOW A FINGER MOVES ONE. It was PointerSensor and TouchSensor together.
 * A finger raises pointer events as well as touch events, so the pointer
 * sensor took every touch on the handle and started a drag after 12px of
 * movement, long before the 380ms hold the touch sensor waited for: there
 * was no hold at all. And the handle was `touch-action: none`, so a swipe
 * that began on it could not scroll the page. Now:
 *
 *   A mouse (MouseSensor) drags after 4px, on a computer.
 *   A finger (TouchSensor) drags after HOLD_MS held within HOLD_TOLERANCE_PX.
 *     Moving further before then is a scroll: the handle is
 *     `touch-action: manipulation`, so the browser scrolls the page as it
 *     would anywhere else, and the sensor lets go. Once the hold has fired,
 *     the sensor cancels every touchmove, so the page stays where it is and
 *     the card follows the finger instead.
 *   A keyboard (KeyboardSensor) lifts with Space or Enter on the handle,
 *     moves with the arrow keys and drops with Space or Enter; Escape puts
 *     it back. What happens is read out in words, not ids.
 *
 * THE CARD UNDER THE FINGER moves by transform only, one to one with it: no
 * transition on its own transform while it is held (a `transition-all` on
 * the card used to make it trail the finger). It lifts on an inner layer,
 * a 2% scale and a soft shadow, so the lift can ease in without the card
 * lagging. The others slide out of its way on dnd-kit's 200ms transition.
 *
 * Near the top or bottom edge of the editor's scrolling pane the pane
 * scrolls by itself (dnd-kit's autoScroll, from the pane it finds).
 *
 * A touchcancel (a call coming in, the system taking the gesture), Escape,
 * or losing the page ends it as a cancel: the order is what it was before
 * the hold. Only a drop commits, into the form's `faqs`, which the save
 * writes as they are ordered.
 */

import * as React from "react"
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
  type UniqueIdentifier,
} from "@dnd-kit/core"
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { GripVertical, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { hapticTap } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"
import type { FAQItem } from "./editor-form"

/** How long a finger holds the handle before the card lifts. */
export const HOLD_MS = 300
/** How far it may wander in that time and still be a hold rather than a scroll. */
export const HOLD_TOLERANCE_PX = 8
/** From a computer, a press that moves this far is a drag, and less is a click. */
export const MOUSE_DISTANCE_PX = 4

/** Up and down only: a question never goes sideways. */
const vertical: Modifier = ({ transform }) => ({ ...transform, x: 0 })

/**
 * A short tick when a finger lifts the card: the app's own haptic
 * (lib/native-bridge), the Taptic Engine inside the iOS app and `vibrate`
 * where a browser has it. A mouse or a key gets none.
 */
function tick(event: Event) {
  if (typeof TouchEvent === "undefined" || !(event instanceof TouchEvent)) return
  try {
    hapticTap("soft")
  } catch {
    /* A browser that refuses it (no user activation yet) says nothing. */
  }
}

export function FaqList({
  faqs,
  onChange,
}: {
  faqs: FAQItem[]
  onChange: (update: (prev: FAQItem[]) => FAQItem[]) => void
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: MOUSE_DISTANCE_PX } }),
    useSensor(TouchSensor, { activationConstraint: { delay: HOLD_MS, tolerance: HOLD_TOLERANCE_PX } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const [activeId, setActiveId] = React.useState<UniqueIdentifier | null>(null)

  /* Positions for the words a screen reader hears, from the order when the drag began. */
  const orderRef = React.useRef<UniqueIdentifier[]>(faqs.map((f) => f.id))
  orderRef.current = faqs.map((f) => f.id)
  const place = (id: UniqueIdentifier | undefined) => (id == null ? 0 : orderRef.current.indexOf(id) + 1)
  const count = faqs.length
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up question ${place(active.id)} of ${count}.`,
    onDragOver: ({ active, over }) =>
      over ? `Question ${place(active.id)} is now at position ${place(over.id)} of ${count}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over ? `Question ${place(active.id)} dropped at position ${place(over.id)} of ${count}.` : "Question dropped where it was.",
    onDragCancel: ({ active }) => `Cancelled. Question ${place(active.id)} is back where it was.`,
  }

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(e.active.id)
    tick(e.activatorEvent)
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
      autoScroll={{ threshold: { x: 0, y: 0.15 }, acceleration: 6 }}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "To move a question, press Space or Enter on its handle, then the up and down arrow keys. Press Space or Enter again to drop it, or Escape to put it back.",
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
            aria-label={`Move question ${position}`}
            className={cn(
              "flex h-11 min-w-0 flex-1 items-center gap-2 pl-3 pr-2 text-left outline-none sm:h-10",
              "cursor-grab select-none touch-manipulation [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent] active:cursor-grabbing",
              "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8b5cf6]",
            )}
          >
            <GripVertical aria-hidden className="h-4 w-4 shrink-0 text-[#9ca3af]" />
            <span className="text-[13px] font-medium text-[#1a1a2e]">Question {position}</span>
            <span className="ml-auto text-[12px] text-[#9ca3af] sm:hidden">Hold to drag</span>
          </button>
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove question ${position}`}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[#9ca3af] transition-colors duration-100 hover:bg-[#fef1ee] hover:text-[#c4290c] active:bg-[#fde4df] sm:h-8 sm:w-8"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <div className="space-y-2.5 p-3 sm:space-y-3 sm:p-4">
          <div className="space-y-1">
            <label htmlFor={`faq-q-${faq.id}`} className="text-[12px] font-medium text-[#6b7280]">
              Question
            </label>
            <Input
              id={`faq-q-${faq.id}`}
              value={faq.question}
              onChange={(e) => onUpdate({ question: e.target.value })}
              className="h-10 rounded-lg border-gray-200 bg-gray-50 text-sm font-medium transition-colors focus:bg-white"
              placeholder="What do buyers ask?"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`faq-a-${faq.id}`} className="text-[12px] font-medium text-[#6b7280]">
              Answer
            </label>
            <Textarea
              id={`faq-a-${faq.id}`}
              value={faq.answer}
              onChange={(e) => onUpdate({ answer: e.target.value })}
              className="min-h-[60px] resize-none rounded-lg border-gray-200 bg-gray-50 text-sm transition-colors focus:bg-white sm:min-h-[70px]"
              placeholder="Your answer"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
