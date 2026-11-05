/**
 * Stripe's hosted wallet page lands here inside the in-app browser.
 * The checkout that opened it finishes the order when that browser closes.
 */
export default async function WalletReturnPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const canceled = params.canceled === "1"
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-white px-6 text-center font-sans">
      <p className="text-[17px] font-semibold text-[#1a1a2e]">{canceled ? "No payment was made" : "Payment received"}</p>
      <p className="mt-2 max-w-[280px] text-[14px] leading-6 text-[#6b7280]">
        {canceled ? "Close this window to go back to checkout." : "Close this window to return to Storelib. Your receipt is on its way."}
      </p>
    </main>
  )
}
