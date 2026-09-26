"use client"

/**
 * The name the OnePage editor has always imported its colour picker by.
 *
 * This file used to be a picker of its own: the browser's <input type="color">
 * on a computer and a hand built sheet with an Apply button on a phone. It is
 * now the one picker in ./color-picker, drawn as a bare swatch, so any call
 * site that still says MobileColorPicker gets the same popover, sheet,
 * eyedropper and recent colours as the rest of the editor. New code should
 * use ColorField (a swatch and its code) or ColorRow (with a label) directly.
 */
import { ColorField } from "@/components/onepage/color-picker"

type Props = {
  value: string
  onChange: (value: string) => void
  label?: string
  className?: string
  presets?: string[]
}

export function MobileColorPicker({ value, onChange, label = "Choose color", className, presets }: Props) {
  return <ColorField variant="swatch" value={value} onChange={onChange} label={label} suggestions={presets} className={className} />
}
