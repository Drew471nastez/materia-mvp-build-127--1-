/**
 * The few sentences a Storelib marketplace checkout says on its own: a
 * purchase paused while no fresh exchange rate exists, the way back, and a
 * payment too large to carry its record. Written and checked by a person in
 * core.ts's voice per language; Romanian has them in ./ro.ts. Merged under
 * core.ts's words.
 */
const RATES = "Prices on Storelib are being updated. Try again in a few minutes."
const BACK = "Back to the product"
const LARGE = "This order is too large to pay in one go. Remove an item and try again."

export const MARKETPLACE_WORDS: Readonly<Record<string, Record<string, string>>> = {
  es: { [RATES]: "Los precios de Storelib se están actualizando. Inténtalo de nuevo en unos minutos.", [BACK]: "Volver al producto", [LARGE]: "Este pedido es demasiado grande para pagarlo de una vez. Quita un artículo e inténtalo de nuevo." },
  fr: { [RATES]: "Les prix sur Storelib sont en cours de mise à jour. Réessayez dans quelques minutes.", [BACK]: "Retour au produit", [LARGE]: "Cette commande est trop importante pour être payée en une fois. Retirez un article et réessayez." },
  de: { [RATES]: "Die Preise auf Storelib werden gerade aktualisiert. Versuch es in ein paar Minuten noch einmal.", [BACK]: "Zurück zum Produkt", [LARGE]: "Diese Bestellung ist zu groß, um sie auf einmal zu bezahlen. Entferne einen Artikel und versuch es noch einmal." },
  it: { [RATES]: "I prezzi su Storelib sono in aggiornamento. Riprova tra qualche minuto.", [BACK]: "Torna al prodotto", [LARGE]: "Questo ordine è troppo grande per essere pagato in una volta. Rimuovi un articolo e riprova." },
  pt: { [RATES]: "Os preços na Storelib estão a ser atualizados. Tente novamente dentro de alguns minutos.", [BACK]: "Voltar ao produto", [LARGE]: "Esta encomenda é demasiado grande para pagar de uma só vez. Remova um artigo e tente novamente." },
  "pt-BR": { [RATES]: "Os preços na Storelib estão sendo atualizados. Tente de novo em alguns minutos.", [BACK]: "Voltar para o produto", [LARGE]: "Este pedido é grande demais para pagar de uma vez. Remova um item e tente de novo." },
  nl: { [RATES]: "De prijzen op Storelib worden bijgewerkt. Probeer het over een paar minuten opnieuw.", [BACK]: "Terug naar het product", [LARGE]: "Deze bestelling is te groot om in één keer te betalen. Verwijder een artikel en probeer het opnieuw." },
  pl: { [RATES]: "Ceny w Storelib są właśnie aktualizowane. Spróbuj ponownie za kilka minut.", [BACK]: "Wróć do produktu", [LARGE]: "To zamówienie jest za duże, by zapłacić za nie jednorazowo. Usuń jeden produkt i spróbuj ponownie." },
}
