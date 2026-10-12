/** What a checkout line could be changed to (./variant-choices-server). Client safe. */
export interface VariantChoice {
  id: string
  name: string
  /** The value of each option, in the options' order; empty for a download. */
  values: string[]
  priceCents: number
  available: boolean
}

export interface VariantChoices {
  options: { name: string; values: string[] }[]
  variants: VariantChoice[]
}

export type ChoicesByProduct = Record<string, VariantChoices>
