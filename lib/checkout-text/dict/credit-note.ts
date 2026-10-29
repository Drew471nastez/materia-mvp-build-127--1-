/**
 * A refund's credit note (lib/checkout/credit-note.ts) and the links to it
 * (the receipt, the order page, the refund email) in the languages ./core.ts
 * curates, in the words each language's accounting uses (Gutschrift, Avoir,
 * Factura rectificativa, Nota di credito, Nota de crédito, Creditnota,
 * Faktura korygująca). Romanian has every sentence in ./ro.ts. Merged with
 * ./invoice.ts's words.
 */

const KEYS = [
  "Credit note", "Credit note {number}", "Credit note number", "Original invoice", "Original receipt", "Refund reference",
  "{amount} {currency} credited on {date}", "Partial refund", "Total credited", "Tax rate", "Net",
  "Refund of invoice {number}.", "Refund of receipt {number}.", "Download the credit note",
] as const

type Words = Record<(typeof KEYS)[number], string>

const es: Words = {
  "Credit note": "Factura rectificativa", "Credit note {number}": "Factura rectificativa {number}", "Credit note number": "Número de factura rectificativa", "Original invoice": "Factura original", "Original receipt": "Recibo original", "Refund reference": "Referencia del reembolso",
  "{amount} {currency} credited on {date}": "{amount} {currency} abonados el {date}", "Partial refund": "Reembolso parcial", "Total credited": "Total abonado", "Tax rate": "Tipo impositivo", "Net": "Base imponible",
  "Refund of invoice {number}.": "Reembolso de la factura {number}.", "Refund of receipt {number}.": "Reembolso del recibo {number}.", "Download the credit note": "Descargar la factura rectificativa",
}
const fr: Words = {
  "Credit note": "Avoir", "Credit note {number}": "Avoir {number}", "Credit note number": "Numéro d'avoir", "Original invoice": "Facture d'origine", "Original receipt": "Reçu d'origine", "Refund reference": "Référence du remboursement",
  "{amount} {currency} credited on {date}": "{amount} {currency} crédités le {date}", "Partial refund": "Remboursement partiel", "Total credited": "Total crédité", "Tax rate": "Taux de taxe", "Net": "Montant HT",
  "Refund of invoice {number}.": "Remboursement de la facture {number}.", "Refund of receipt {number}.": "Remboursement du reçu {number}.", "Download the credit note": "Télécharger l'avoir",
}
const de: Words = {
  "Credit note": "Gutschrift", "Credit note {number}": "Gutschrift {number}", "Credit note number": "Gutschriftnummer", "Original invoice": "Ursprüngliche Rechnung", "Original receipt": "Ursprüngliche Quittung", "Refund reference": "Erstattungsreferenz",
  "{amount} {currency} credited on {date}": "{amount} {currency} gutgeschrieben am {date}", "Partial refund": "Teilerstattung", "Total credited": "Gutschrift gesamt", "Tax rate": "Steuersatz", "Net": "Netto",
  "Refund of invoice {number}.": "Erstattung zur Rechnung {number}.", "Refund of receipt {number}.": "Erstattung zur Quittung {number}.", "Download the credit note": "Gutschrift herunterladen",
}
const it: Words = {
  "Credit note": "Nota di credito", "Credit note {number}": "Nota di credito {number}", "Credit note number": "Numero della nota di credito", "Original invoice": "Fattura originale", "Original receipt": "Ricevuta originale", "Refund reference": "Riferimento del rimborso",
  "{amount} {currency} credited on {date}": "{amount} {currency} accreditati il {date}", "Partial refund": "Rimborso parziale", "Total credited": "Totale accreditato", "Tax rate": "Aliquota", "Net": "Imponibile",
  "Refund of invoice {number}.": "Rimborso della fattura {number}.", "Refund of receipt {number}.": "Rimborso della ricevuta {number}.", "Download the credit note": "Scarica la nota di credito",
}
const pt: Words = {
  "Credit note": "Nota de crédito", "Credit note {number}": "Nota de crédito {number}", "Credit note number": "Número da nota de crédito", "Original invoice": "Fatura original", "Original receipt": "Recibo original", "Refund reference": "Referência do reembolso",
  "{amount} {currency} credited on {date}": "{amount} {currency} creditados a {date}", "Partial refund": "Reembolso parcial", "Total credited": "Total creditado", "Tax rate": "Taxa de imposto", "Net": "Valor líquido",
  "Refund of invoice {number}.": "Reembolso da fatura {number}.", "Refund of receipt {number}.": "Reembolso do recibo {number}.", "Download the credit note": "Transferir a nota de crédito",
}
const ptBR: Words = {
  ...pt,
  "{amount} {currency} credited on {date}": "{amount} {currency} creditados em {date}", "Download the credit note": "Baixar a nota de crédito",
}
const nl: Words = {
  "Credit note": "Creditnota", "Credit note {number}": "Creditnota {number}", "Credit note number": "Creditnotanummer", "Original invoice": "Oorspronkelijke factuur", "Original receipt": "Oorspronkelijk ontvangstbewijs", "Refund reference": "Referentie terugbetaling",
  "{amount} {currency} credited on {date}": "{amount} {currency} gecrediteerd op {date}", "Partial refund": "Gedeeltelijke terugbetaling", "Total credited": "Totaal gecrediteerd", "Tax rate": "Btw-tarief", "Net": "Netto",
  "Refund of invoice {number}.": "Terugbetaling van factuur {number}.", "Refund of receipt {number}.": "Terugbetaling van ontvangstbewijs {number}.", "Download the credit note": "Creditnota downloaden",
}
const pl: Words = {
  "Credit note": "Faktura korygująca", "Credit note {number}": "Faktura korygująca {number}", "Credit note number": "Numer faktury korygującej", "Original invoice": "Faktura pierwotna", "Original receipt": "Paragon pierwotny", "Refund reference": "Numer zwrotu",
  "{amount} {currency} credited on {date}": "{amount} {currency} skorygowano {date}", "Partial refund": "Częściowy zwrot", "Total credited": "Razem do zwrotu", "Tax rate": "Stawka podatku", "Net": "Netto",
  "Refund of invoice {number}.": "Zwrot do faktury {number}.", "Refund of receipt {number}.": "Zwrot do paragonu {number}.", "Download the credit note": "Pobierz fakturę korygującą",
}

export const CREDIT_NOTE_WORDS: Readonly<Record<string, Record<string, string>>> = { es, fr, de, it, pt, "pt-BR": ptBR, nl, pl }
