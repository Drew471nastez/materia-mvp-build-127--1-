"use client"
import { SectionWrapper, sectionColors, str, bool, type SectionProps } from "../_shared"
import { NativeFormBlock, presentationOf } from "@/components/forms/native-form-block"
import { UUID } from "@/lib/forms/actions"
/** "Show as", or for a section saved before it, the old inline toggle. */
const shownAs = (presentation: string, inline: boolean) => presentationOf({ presentation, inline })

export function NativeFormSection({
  section,
  theme,
  isEditing,
  isSelected,
  onClick,
  insideEditor,
}: SectionProps) {
  const s = section.settings as Record<string, unknown>
  const colors = sectionColors(section, theme)
  const ref = String(s.form_url || "")
  const id =
    ref
      .split(/[/?#]/)
      .filter(Boolean)
      .reverse()
      .find((part) => UUID.test(part)) || ""
  return (
    <SectionWrapper
      id={section.id}
      bgColor={colors.bg}
      isEditing={isEditing}
      isSelected={isSelected}
      onClick={onClick}
      className="px-5 py-8"
      style={{ color: colors.text }}
    >
      {" "}
      <div data-native-form-section="">
        <div className="mx-auto max-w-lg">
          <NativeFormBlock
            formId={id}
            title={String(s.button_text ?? "Open form")}
            presentation={shownAs(str(s.presentation, ""), bool(s.inline, true))}
            source="website"
            preview={insideEditor === true}
          />
        </div>
      </div>
    </SectionWrapper>
  )
}
