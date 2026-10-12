"use client"

/**
 * The description's rich text field, loaded with the page that shows it.
 * For the seller's own forms (components/app/product-edit-form.tsx), where
 * the field is the page. A buyer's page never imports this: the creator
 * page's Edit in place loads the same field only when it is pressed
 * (./description-rich-editor.tsx).
 */
import { RichTextEditor } from "@/components/app/rich-text-editor"

export function DescriptionField({ value, onChange, className }: { value: string; onChange: (value: string) => void; className?: string }) {
  return <RichTextEditor value={value} onChange={onChange} label="Description" placeholder="What it is, who it is for, and what they get" className={className} />
}
