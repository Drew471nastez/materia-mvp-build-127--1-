import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import { PayoutsClient } from "./payouts-client";
import { StorelibPaymentsInline } from "@/components/app/settings/storelib-payments-inline";
import { checkoutReadyForCreator } from "@/lib/payments/service";
import { TryProStrip } from "@/components/app/announcement-bar-mobile";
import { platformChargeCurrency } from "@/lib/payments/fees/currency-rules";
import { pickBalance, salesCurrencyOf } from "@/lib/payments/display-currency";
import { Shimmer, ShimmerBlock, ShimmerChart, ShimmerRows } from "@/components/ui/shimmer";
import { pageUser } from "@/lib/auth/page-user"
import { PaneBar } from "@/app/app/orders/order-parts"

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Payouts",
};

export default async function PayoutsPage() {
  const adminSupabase = createAdminClient();

  /* The same answer the /app layout got, through the per-request cache
     (lib/auth/request-scope.ts): no second auth round trip on a full load. */
  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the
     session in the browser. Not /login (lib/auth/page-user.ts). */
  if (!user) return null

  const { data: creator, error: creatorError } = await adminSupabase
    .from("creators")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (creatorError || !creator) {
    redirect("/onboarding");
  }

  const paymentsReady = await checkoutReadyForCreator(creator.id)

  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter">
      <TryProStrip />

      {paymentsReady ? (
        <>
          <PaneBar width="max-w-[1200px]" className="flex min-h-[66px] items-center justify-between gap-3 pb-2 pt-[14px]">
            <div className="min-w-0">
              <h1 className="truncate text-[24px] font-bold leading-8 text-[#1a1a2e] sm:text-[28px] sm:leading-9">Payouts</h1>
            </div>
            <div data-payouts-actions="" className="flex shrink-0 items-center gap-1.5 md:gap-2" />
          </PaneBar>
          <div className="mx-auto max-w-[1200px] app-gutter pb-8">
            <Suspense fallback={<PayoutsWaiting />}>{PayoutsBody({ creator })}</Suspense>
          </div>
        </>
      ) : (
        <div className="mx-auto min-h-full max-w-[1200px] app-gutter pb-24 md:pb-8" data-payouts-setup="">
          <header className="pb-1 pt-2">
            <h1 className="flex min-h-[48px] items-center text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Payouts</h1>
            <p className="-mt-1 text-[13px] leading-5 text-[#6b7280]">Set up payments to start selling</p>
          </header>
          <div className="mt-4">
            <StorelibPaymentsInline compact />
          </div>
        </div>
      )}
    </div>
  );
}

/*
  STRIPE DOES NOT STAND BETWEEN THE PRESS AND THE PAGE. Everything below
  waits on Stripe (the balance, the account, the recent transactions, a
  dashboard link) and on a market rate from outside, which on a slow day is
  well over a second. It used to be awaited before anything was sent, so a
  press on Payouts sat on the page you were on, then under the spinner. Now
  the page's heading and frame are sent as soon as the creator row is read,
  the navigation lands on them, and this part streams in behind
  PayoutsWaiting: nothing for 200ms, then the page's own shapes in light
  gray. Every read is the one it was.
*/

/**
 * What Stripe's part of the page will be, drawn in light gray while it
 * streams (components/ui/shimmer), and only if it takes longer than 200ms:
 * a quick answer never shows it. The same cards, radii and gaps as
 * PayoutsClient, so the answer lands where the shapes were: the balance
 * card with its three figures (the first across a phone's row), the revenue
 * card with its figure, the period and the plot, and the list card with its
 * toolbar and rows.
 */
function PayoutsWaiting() {
  return (
    <Shimmer className="space-y-4 pt-2" label="Loading payouts">
      <div className={WAIT_CARD}>
        <div className="flex h-10 items-center justify-between pl-4 pr-3.5 pt-1">
          <ShimmerBlock className="h-3 w-16 rounded-full" />
          <ShimmerBlock className="h-7 w-16 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3">
          {["col-span-2 sm:col-span-1", "", ""].map((span, i) => (
            <div key={i} className={`space-y-2 px-4 pb-3.5 pt-2 ${span}`}>
              <ShimmerBlock className="h-2.5 w-20 rounded-full" />
              <ShimmerBlock className="h-6 w-28 rounded-lg" />
              <ShimmerBlock className="h-2 w-24 rounded-full" />
            </div>
          ))}
        </div>
        <div className="h-10 border-t border-[#eef0f2] bg-[#fafafb]" />
      </div>
      <div className={WAIT_CARD}>
        <div className="flex items-start justify-between gap-3 px-4 pt-3.5">
          <div className="space-y-2.5">
            <ShimmerBlock className="h-3 w-16 rounded-full" />
            <ShimmerBlock className="h-6 w-32 rounded-lg" />
          </div>
          <ShimmerBlock className="h-8 w-32 rounded-lg" />
        </div>
        <div className="px-2 pb-1 pt-4 sm:px-3">
          <ShimmerChart height={192} bare />
        </div>
        <div className="h-10 border-t border-[#f0f1f3]" />
      </div>
      <div className={WAIT_CARD}>
        <div className="flex h-14 items-center border-b border-[#eef0f2] px-3 md:h-12">
          <ShimmerBlock className="h-8 w-[168px] rounded-[9px]" />
        </div>
        <ShimmerRows rows={3} rowHeight={56} cols={["30%", "18%", "12%"]} bare />
      </div>
    </Shimmer>
  );
}

/** The client's card (app/app/orders/order-parts `card`), written out: this is a server file. */
const WAIT_CARD = "overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]";

async function PayoutsBody({ creator }: { creator: any }) {
  const adminSupabase = createAdminClient();

  /*
    FOUR TRIPS, WHERE THERE WERE UP TO ELEVEN. This page asked its questions
    one at a time: the products, then the orders, then Stripe, then the
    ledger, then the tax year's orders, then a dashboard link, then the
    ledger again, then the disputed orders. Most of them need only the
    creator row, or only the product ids, so they are asked together:

      with the creator:   the products, Stripe (the balance and the account),
                          and the ledger row (every column this page reads
                          off it, in one read: it was read twice)
      with the products:  the orders, the tax year's orders, the disputed
                          orders

    Every query is scoped by the creator row found by the signed in user's
    id, on the service role client. A failed tax or ledger read leaves its
    figures at nothing rather than failing the page.

    THE BALANCE IS NO LONGER CONVERTED OR INVENTED. It used to read Stripe's
    recent balance transactions for an exchange rate, convert the balance to
    dollars, and, when Stripe answered nothing, show the creator's all time
    order totals in its place. Now it is what Stripe holds, in the currency
    Stripe holds it in, and nothing when Stripe cannot be read: the page
    asks again within seconds.
  */
  const stripeAccount: string | null = creator.stripe_account_id || null;
  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;

  const [{ data: productsData }, stripeRead, ledger] = await Promise.all([
    adminSupabase.from("products").select("*").eq("creator_id", creator.id),
    stripeAccount
      ? Promise.all([
          stripe.balance.retrieve({}, { stripeAccount }),
          stripe.accounts.retrieve(stripeAccount),
        ]).then(
          (value) => ({ ok: true as const, value }),
          (error: unknown) => ({ ok: false as const, error }),
        )
      : Promise.resolve(null),
    Promise.resolve(
      adminSupabase
        .from("seller_ledger")
        .select("available_amount, pending_amount, negative_balance")
        .eq("creator_id", creator.id)
        .maybeSingle(),
    ).then(
      (r) => r.data as { available_amount: number | null; pending_amount: number | null; negative_balance: number | null } | null,
      () => null,
    ),
  ]);

  const products = productsData || [];
  const productIds = products.map((p) => p.id);

  const nothing = { data: null };
  const [ordersRead, taxRead, disputedRead] = productIds.length > 0
    ? await Promise.all([
        adminSupabase
          .from("orders")
          .select("*")
          .in("product_id", productIds)
          .in("status", ["completed", "refunded", "disputed"])
          .order("created_at", { ascending: false }),
        Promise.resolve(
          adminSupabase
            .from("orders")
            .select("amount_cents, created_at, status")
            .in("product_id", productIds)
            .in("status", ["completed", "refunded", "disputed"])
            .gte("created_at", `${previousYear}-01-01T00:00:00Z`),
        ).then((r) => r, () => nothing),
        Promise.resolve(
          adminSupabase
            .from("orders")
            .select("amount_cents")
            .in("product_id", productIds)
            .eq("status", "disputed"),
        ).then((r) => r, () => nothing),
      ])
    : [nothing, nothing, nothing];

  let allOrders: any[] = [];
  const ordersData = ordersRead.data as any[] | null;
  if (ordersData) {
    allOrders = ordersData.map((order) => {
      const product = products.find((p) => p.id === order.product_id);
      return {
        ...order,
        product: product
          ? {
              title: product.title,
              thumbnail_url:
                product.thumbnail_url || product.gallery_images?.[0] || null,
              type: product.type || null,
            }
          : null,
      };
    });
  }

  /*
    THE BALANCE IS STRIPE'S, IN STRIPE'S CURRENCY. This used to convert it
    to dollars with a market rate and, when Stripe answered nothing, put the
    creator's all time order totals in its place, so a lei balance read as
    dollars and an empty one read as everything ever sold. Now: what Stripe
    holds, in the currency it holds it in (lib/payments/display-currency),
    and nothing at all when Stripe cannot be read; the page asks again
    within seconds (PayoutsClient refreshBalances). Sales keep the currency
    they were charged in.
  */
  const salesCurrency = salesCurrencyOf(allOrders, platformChargeCurrency());
  let balanceCurrency = salesCurrency;
  let stripeAvailableBalance = 0;
  let stripePendingBalance = 0;
  if (stripeRead?.ok) {
    const [balance, account] = stripeRead.value;
    const picked = pickBalance(balance, account.default_currency);
    if (picked) {
      balanceCurrency = picked.currency;
      stripeAvailableBalance = picked.available;
      stripePendingBalance = picked.pending;
    } else if (account.default_currency) {
      balanceCurrency = account.default_currency.toLowerCase();
    }
  } else if (stripeRead && !stripeRead.ok) {
    console.error("[Payouts] Stripe balance not read:", stripeRead.error instanceof Error ? stripeRead.error.message.slice(0, 160) : "unknown");
  }

  // ── 1099-K Tax Data ──────────────────────────────────────────────────────────
  const taxData: {
    currentYear: { year: number; grossCents: number; transactionCount: number; isEligible: boolean };
    previousYear: { year: number; grossCents: number; transactionCount: number; isEligible: boolean };
    stripeExpressDashboardUrl: string | null;
  } = {
    currentYear: { year: currentYear, grossCents: 0, transactionCount: 0, isEligible: false },
    previousYear: { year: previousYear, grossCents: 0, transactionCount: 0, isEligible: false },
    stripeExpressDashboardUrl: null,
  };

  if (productIds.length > 0) {
    for (const order of (taxRead.data as { amount_cents: number | null; created_at: string }[] | null) || []) {
      const orderYear = new Date(order.created_at).getFullYear();
      const bucket = orderYear === currentYear ? taxData.currentYear : orderYear === previousYear ? taxData.previousYear : null;
      if (bucket) {
        bucket.grossCents += order.amount_cents || 0;
        bucket.transactionCount += 1;
      }
    }

    taxData.currentYear.isEligible = taxData.currentYear.grossCents >= 2000000 && taxData.currentYear.transactionCount >= 200;
    taxData.previousYear.isEligible = taxData.previousYear.grossCents >= 2000000 && taxData.previousYear.transactionCount >= 200;
  }

  // Dispute and negative balance figures, from the ledger row and the disputed orders
  const negativeBalance = ledger?.negative_balance || 0;
  const disputed = (disputedRead.data as { amount_cents: number | null }[] | null) || [];
  const activeDisputeCount = disputed.length;
  const totalDisputedAmount = disputed.reduce((s, o) => s + (o.amount_cents || 0), 0);

  const paymentsReady = await checkoutReadyForCreator(creator.id)

  return (
    <PayoutsClient
      paymentsReady={paymentsReady}
      creator={creator}
      initialData={{
        balanceCurrency,
        salesCurrency,
        pendingAmount: stripePendingBalance,
        availableBalance: stripeAvailableBalance,
        stripeRead: !!stripeRead?.ok,
        negativeBalance,
        activeDisputeCount,
        totalDisputedAmount,
        taxData,
      }}
      initialOrders={allOrders}
    />
  );
}
