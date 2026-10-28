/**
 * The receipt and invoice PDF (lib/checkout/invoice.ts) in the languages
 * ./core.ts curates. Written and checked by a person, keyed by the English
 * sentence as ct("…") is given it, in the words invoices in each language
 * use (Rechnung, Facture, Factura, Fattura, Fatura, Factuur, Faktura).
 * Romanian has every sentence in ./ro.ts.
 *
 * Merged under core.ts's and order-page.ts's words (they win where both
 * have a sentence), so a buyer who paid in one of these languages gets the
 * PDF in it too.
 */

const KEYS = [
  "Invoice", "Receipt", "Sold through Storelib", "Paid", "Refunded", "Partially refunded", "Disputed",
  "Invoice number", "Receipt number", "Date of issue", "Order date", "Order", "Payment", "Payment reference", "Status",
  "Attn: {name}", "Billed to", "Paid by", "Trading as {store}", "Sold by", "Shipped to",
  "{amount} {currency} refunded", "{amount} {currency} paid on {date}",
  "Description", "Qty", "Unit price", "Amount", "Tip", "Amount paid", "Including {tax}", "Including tax", "Including tax{rate}", "{brand} ending {last4}",
  "Invoice for a completed payment.", "Receipt for a completed payment.", "Sold by {store} through Storelib (storelib.com).", "Amounts are in {currency}.", "US dollars", "Questions about this purchase: {email}.",
] as const

type Words = Record<(typeof KEYS)[number], string>

const es: Words = {
  "Invoice": "Factura", "Receipt": "Recibo", "Sold through Storelib": "Vendido a través de Storelib", "Paid": "Pagado", "Refunded": "Reembolsado", "Partially refunded": "Reembolsado en parte", "Disputed": "En disputa",
  "Invoice number": "Número de factura", "Receipt number": "Número de recibo", "Date of issue": "Fecha de emisión", "Order date": "Fecha del pedido", "Order": "Pedido", "Payment": "Pago", "Payment reference": "Referencia del pago", "Status": "Estado",
  "Attn: {name}": "A la atención de {name}", "Billed to": "Facturado a", "Paid by": "Pagado por", "Trading as {store}": "Con el nombre comercial {store}", "Sold by": "Vendido por", "Shipped to": "Enviado a",
  "{amount} {currency} refunded": "{amount} {currency} reembolsados", "{amount} {currency} paid on {date}": "{amount} {currency} pagados el {date}",
  "Description": "Descripción", "Qty": "Cant.", "Unit price": "Precio unitario", "Amount": "Importe", "Tip": "Propina", "Amount paid": "Importe pagado", "Including {tax}": "{tax} incluido", "Including tax": "Impuestos incluidos", "Including tax{rate}": "Impuestos incluidos{rate}", "{brand} ending {last4}": "{brand} terminada en {last4}",
  "Invoice for a completed payment.": "Factura de un pago completado.", "Receipt for a completed payment.": "Recibo de un pago completado.", "Sold by {store} through Storelib (storelib.com).": "Vendido por {store} a través de Storelib (storelib.com).", "Amounts are in {currency}.": "Importes en {currency}.", "US dollars": "dólares estadounidenses", "Questions about this purchase: {email}.": "Preguntas sobre esta compra: {email}.",
}

const fr: Words = {
  "Invoice": "Facture", "Receipt": "Reçu", "Sold through Storelib": "Vendu via Storelib", "Paid": "Payée", "Refunded": "Remboursée", "Partially refunded": "Remboursée en partie", "Disputed": "Contestée",
  "Invoice number": "Numéro de facture", "Receipt number": "Numéro de reçu", "Date of issue": "Date d'émission", "Order date": "Date de commande", "Order": "Commande", "Payment": "Paiement", "Payment reference": "Référence du paiement", "Status": "Statut",
  "Attn: {name}": "À l'attention de {name}", "Billed to": "Facturé à", "Paid by": "Payé par", "Trading as {store}": "Nom commercial : {store}", "Sold by": "Vendu par", "Shipped to": "Expédié à",
  "{amount} {currency} refunded": "{amount} {currency} remboursés", "{amount} {currency} paid on {date}": "{amount} {currency} payés le {date}",
  "Description": "Description", "Qty": "Qté", "Unit price": "Prix unitaire", "Amount": "Montant", "Tip": "Pourboire", "Amount paid": "Montant payé", "Including {tax}": "Dont {tax}", "Including tax": "Taxes incluses", "Including tax{rate}": "Taxes incluses{rate}", "{brand} ending {last4}": "{brand} se terminant par {last4}",
  "Invoice for a completed payment.": "Facture d'un paiement effectué.", "Receipt for a completed payment.": "Reçu d'un paiement effectué.", "Sold by {store} through Storelib (storelib.com).": "Vendu par {store} via Storelib (storelib.com).", "Amounts are in {currency}.": "Montants en {currency}.", "US dollars": "dollars américains", "Questions about this purchase: {email}.": "Questions sur cet achat : {email}.",
}

const de: Words = {
  "Invoice": "Rechnung", "Receipt": "Quittung", "Sold through Storelib": "Verkauft über Storelib", "Paid": "Bezahlt", "Refunded": "Erstattet", "Partially refunded": "Teilweise erstattet", "Disputed": "Angefochten",
  "Invoice number": "Rechnungsnummer", "Receipt number": "Quittungsnummer", "Date of issue": "Ausstellungsdatum", "Order date": "Bestelldatum", "Order": "Bestellung", "Payment": "Zahlung", "Payment reference": "Zahlungsreferenz", "Status": "Status",
  "Attn: {name}": "z. Hd. {name}", "Billed to": "Rechnungsempfänger", "Paid by": "Bezahlt von", "Trading as {store}": "Handelsname: {store}", "Sold by": "Verkauft von", "Shipped to": "Versandt an",
  "{amount} {currency} refunded": "{amount} {currency} erstattet", "{amount} {currency} paid on {date}": "{amount} {currency} bezahlt am {date}",
  "Description": "Beschreibung", "Qty": "Menge", "Unit price": "Einzelpreis", "Amount": "Betrag", "Tip": "Trinkgeld", "Amount paid": "Bezahlter Betrag", "Including {tax}": "Inkl. {tax}", "Including tax": "Inkl. Steuern", "Including tax{rate}": "Inkl. Steuern{rate}", "{brand} ending {last4}": "{brand} mit Endziffern {last4}",
  "Invoice for a completed payment.": "Rechnung über eine abgeschlossene Zahlung.", "Receipt for a completed payment.": "Quittung über eine abgeschlossene Zahlung.", "Sold by {store} through Storelib (storelib.com).": "Verkauft von {store} über Storelib (storelib.com).", "Amounts are in {currency}.": "Beträge in {currency}.", "US dollars": "US-Dollar", "Questions about this purchase: {email}.": "Fragen zu diesem Kauf: {email}.",
}

const it: Words = {
  "Invoice": "Fattura", "Receipt": "Ricevuta", "Sold through Storelib": "Venduto tramite Storelib", "Paid": "Pagata", "Refunded": "Rimborsata", "Partially refunded": "Rimborsata in parte", "Disputed": "Contestata",
  "Invoice number": "Numero fattura", "Receipt number": "Numero ricevuta", "Date of issue": "Data di emissione", "Order date": "Data dell'ordine", "Order": "Ordine", "Payment": "Pagamento", "Payment reference": "Riferimento del pagamento", "Status": "Stato",
  "Attn: {name}": "Alla c.a. di {name}", "Billed to": "Fatturato a", "Paid by": "Pagato da", "Trading as {store}": "Nome commerciale: {store}", "Sold by": "Venduto da", "Shipped to": "Spedito a",
  "{amount} {currency} refunded": "{amount} {currency} rimborsati", "{amount} {currency} paid on {date}": "{amount} {currency} pagati il {date}",
  "Description": "Descrizione", "Qty": "Qtà", "Unit price": "Prezzo unitario", "Amount": "Importo", "Tip": "Mancia", "Amount paid": "Importo pagato", "Including {tax}": "{tax} inclusa", "Including tax": "Tasse incluse", "Including tax{rate}": "Tasse incluse{rate}", "{brand} ending {last4}": "{brand} che termina con {last4}",
  "Invoice for a completed payment.": "Fattura per un pagamento completato.", "Receipt for a completed payment.": "Ricevuta per un pagamento completato.", "Sold by {store} through Storelib (storelib.com).": "Venduto da {store} tramite Storelib (storelib.com).", "Amounts are in {currency}.": "Importi in {currency}.", "US dollars": "dollari statunitensi", "Questions about this purchase: {email}.": "Domande su questo acquisto: {email}.",
}

const pt: Words = {
  "Invoice": "Fatura", "Receipt": "Recibo", "Sold through Storelib": "Vendido através da Storelib", "Paid": "Paga", "Refunded": "Reembolsada", "Partially refunded": "Reembolsada em parte", "Disputed": "Contestada",
  "Invoice number": "Número da fatura", "Receipt number": "Número do recibo", "Date of issue": "Data de emissão", "Order date": "Data da encomenda", "Order": "Encomenda", "Payment": "Pagamento", "Payment reference": "Referência do pagamento", "Status": "Estado",
  "Attn: {name}": "Ao cuidado de {name}", "Billed to": "Faturado a", "Paid by": "Pago por", "Trading as {store}": "Nome comercial: {store}", "Sold by": "Vendido por", "Shipped to": "Enviado para",
  "{amount} {currency} refunded": "{amount} {currency} reembolsados", "{amount} {currency} paid on {date}": "{amount} {currency} pagos a {date}",
  "Description": "Descrição", "Qty": "Qtd.", "Unit price": "Preço unitário", "Amount": "Valor", "Tip": "Gorjeta", "Amount paid": "Valor pago", "Including {tax}": "{tax} incluído", "Including tax": "Impostos incluídos", "Including tax{rate}": "Impostos incluídos{rate}", "{brand} ending {last4}": "{brand} terminado em {last4}",
  "Invoice for a completed payment.": "Fatura de um pagamento concluído.", "Receipt for a completed payment.": "Recibo de um pagamento concluído.", "Sold by {store} through Storelib (storelib.com).": "Vendido por {store} através da Storelib (storelib.com).", "Amounts are in {currency}.": "Valores em {currency}.", "US dollars": "dólares americanos", "Questions about this purchase: {email}.": "Dúvidas sobre esta compra: {email}.",
}

const ptBR: Words = {
  ...pt,
  "Order date": "Data do pedido", "Order": "Pedido", "Status": "Status", "Attn: {name}": "A/C {name}", "Shipped to": "Enviado para",
  "{amount} {currency} paid on {date}": "{amount} {currency} pagos em {date}", "Unit price": "Preço unitário",
}

const nl: Words = {
  "Invoice": "Factuur", "Receipt": "Bon", "Sold through Storelib": "Verkocht via Storelib", "Paid": "Betaald", "Refunded": "Terugbetaald", "Partially refunded": "Deels terugbetaald", "Disputed": "Betwist",
  "Invoice number": "Factuurnummer", "Receipt number": "Bonnummer", "Date of issue": "Factuurdatum", "Order date": "Besteldatum", "Order": "Bestelling", "Payment": "Betaling", "Payment reference": "Betalingskenmerk", "Status": "Status",
  "Attn: {name}": "T.a.v. {name}", "Billed to": "Gefactureerd aan", "Paid by": "Betaald door", "Trading as {store}": "Handelsnaam: {store}", "Sold by": "Verkocht door", "Shipped to": "Verzonden naar",
  "{amount} {currency} refunded": "{amount} {currency} terugbetaald", "{amount} {currency} paid on {date}": "{amount} {currency} betaald op {date}",
  "Description": "Omschrijving", "Qty": "Aantal", "Unit price": "Stukprijs", "Amount": "Bedrag", "Tip": "Fooi", "Amount paid": "Betaald bedrag", "Including {tax}": "Inclusief {tax}", "Including tax": "Inclusief btw", "Including tax{rate}": "Inclusief btw{rate}", "{brand} ending {last4}": "{brand} eindigend op {last4}",
  "Invoice for a completed payment.": "Factuur voor een voltooide betaling.", "Receipt for a completed payment.": "Bon voor een voltooide betaling.", "Sold by {store} through Storelib (storelib.com).": "Verkocht door {store} via Storelib (storelib.com).", "Amounts are in {currency}.": "Bedragen in {currency}.", "US dollars": "Amerikaanse dollars", "Questions about this purchase: {email}.": "Vragen over deze aankoop: {email}.",
}

const pl: Words = {
  "Invoice": "Faktura", "Receipt": "Paragon", "Sold through Storelib": "Sprzedane przez Storelib", "Paid": "Opłacona", "Refunded": "Zwrócona", "Partially refunded": "Zwrócona częściowo", "Disputed": "Sporna",
  "Invoice number": "Numer faktury", "Receipt number": "Numer paragonu", "Date of issue": "Data wystawienia", "Order date": "Data zamówienia", "Order": "Zamówienie", "Payment": "Płatność", "Payment reference": "Numer płatności", "Status": "Status",
  "Attn: {name}": "Do rąk: {name}", "Billed to": "Nabywca", "Paid by": "Zapłacił(a)", "Trading as {store}": "Nazwa handlowa: {store}", "Sold by": "Sprzedawca", "Shipped to": "Wysłano do",
  "{amount} {currency} refunded": "Zwrócono {amount} {currency}", "{amount} {currency} paid on {date}": "Zapłacono {amount} {currency} dnia {date}",
  "Description": "Opis", "Qty": "Ilość", "Unit price": "Cena jednostkowa", "Amount": "Kwota", "Tip": "Napiwek", "Amount paid": "Zapłacono", "Including {tax}": "W tym {tax}", "Including tax": "W tym podatek", "Including tax{rate}": "W tym podatek{rate}", "{brand} ending {last4}": "{brand} kończąca się na {last4}",
  "Invoice for a completed payment.": "Faktura za zrealizowaną płatność.", "Receipt for a completed payment.": "Paragon za zrealizowaną płatność.", "Sold by {store} through Storelib (storelib.com).": "Sprzedawca {store}, przez Storelib (storelib.com).", "Amounts are in {currency}.": "Kwoty w {currency}.", "US dollars": "dolarach amerykańskich", "Questions about this purchase: {email}.": "Pytania o ten zakup: {email}.",
}

export const INVOICE_WORDS: Readonly<Record<string, Record<string, string>>> = { es, fr, de, it, pt, "pt-BR": ptBR, nl, pl }
