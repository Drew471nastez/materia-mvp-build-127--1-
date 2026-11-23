import { Suspense } from "react";
import { dataOrThrow } from "@/lib/net/service-error"
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import { PayoutsClient } from "./payouts-client";
import { StorelibPaymentsInline } from "@/components/app/settings/storelib-payments-inline";
import { checkoutReadyForCreator, overview } from "@/lib/payments/service";
import { StorelibPaymentsCardLoading } from "@/components/app/settings/storelib-payments-card";
import { TryProStrip } from "@/components/app/announcement-bar-mobile";
import { pickBalance } from "@/lib/payments/display-currency";
import { ledgerCurrency } from "@/lib/payments/ledger-currency";
import { readStoreCurrency } from "@/lib/store/selling-currency-read";
import { disputedInStore, taxYearsInUsd } from "@/lib/money/payout-figures";
import { latestCreatorOrders, readCreatorOrders } from "@/lib/analytics/creator-orders";
import { payoutTips } from "@/lib/onepage/tips-ledger";
import { Shimmer, ShimmerBlock, ShimmerChart, ShimmerRows } from "@/components/ui/shimmer";
import { noStorePage, teamPageStore } from "@/lib/team/server"
import { PaneBar } from "@/app/(storelib)/app/orders/order-parts"
import type { Metadata } from "next"
import { getServerTt } from "@/lib/i18n/server"

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return {
    title: tt("Payouts"),
  }
}

export default async function PayoutsPage() {
  const { tt } = await getServerTt()
  const adminSupabase = createAdminClient();

  /* The same answer the /app layout got, through the per-request cache
     (lib/auth/request-scope.ts): no second auth round trip on a full load. */
  /*
    Whose store (round 42): the owner's own, or the store a team member with
    Payouts works in (lib/team/server teamPageStore). A member sees its
    balance and payouts; Cash out and the bank are drawn only with Change
    payouts, and the routes ask again (lib/team/money).
  */
  const access = await teamPageStore("payouts")
  if (access.kind === "signed_out" || access.kind === "denied") return null
  if (access.kind === "none") return noStorePage("/app/payouts")
  const canManage = access.isOwner || !!access.acting?.permissions.includes("payouts_manage")

  /* The row and whether checkout is open, asked together: both need only the store's id. */
  const [{ data: creator, error: creatorError }, paymentsReady] = await Promise.all([
    adminSupabase.from("creators").select("*").eq("id", access.creatorId).single(),
    checkoutReadyForCreator(access.creatorId),
  ]);

  /* A read that failed is not "no store" (round 51): thrown, and app/app/error.tsx asks again quietly. It sent a seller to /onboarding. */
  if (creatorError) dataOrThrow("creator", { data: creator, error: creatorError });
  if (!creator) {
    redirect("/onboarding");
  }


  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter">
      <TryProStrip />

      {paymentsReady ? (
        <>
          <PaneBar width="max-w-[1200px]" className="flex min-h-[66px] items-center justify-between gap-3 pb-2 pt-[14px]">
            <div className="min-w-0">
              <h1 className="truncate text-[24px] font-bold leading-8 text-[#1a1a2e] sm:text-[28px] sm:leading-9">{tt("Payouts")}</h1>
            </div>
            <div data-payouts-actions="" className="flex shrink-0 items-center gap-1.5 md:gap-2" />
          </PaneBar>
          <div className="mx-auto max-w-[1200px] app-gutter pb-8">
            <Suspense fallback={<PayoutsWaiting label={tt("Loading payouts")} />}>{PayoutsBody({ creator, paymentsReady, canManage })}</Suspense>
          </div>
        </>
      ) : (
        <div className="mx-auto min-h-full max-w-[1200px] app-gutter pb-24 md:pb-8" data-payouts-setup="">
          <header className="pb-1 pt-2">
            <h1 className="flex min-h-[48px] items-center text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{tt("Payouts")}</h1>
            <p className="-mt-1 text-[13px] leading-5 text-[#6b7280]">{tt("Set up payments to start selling")}</p>
          </header>
          <div className="mt-4">
            {canManage && access.isOwner ? (
              /* Drawn from what Storelib already knows (no Stripe call), then brought up to date in the browser: no spinner, and setup resumes on the step it was left on. */
              <Suspense fallback={<SetupWaiting />}>
                {SetupCard({ creatorId: creator.id, userId: creator.user_id })}
              </Suspense>
            ) : (
              /* Setting up payments is the account holder's own identity: the owner's whatever is given (lib/team/money). */
              <p className="rounded-2xl border border-[#e5e7eb]/60 bg-white px-4 py-4 text-[14px] text-[#6b7280] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                {tt("Payments are not set up for this store yet. The store's owner sets them up.")}
              </p>
            )}
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
function PayoutsWaiting({ label }: { label: string }) {
  return (
    <Shimmer className="space-y-4 pt-2" label={label}>
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

/*
  THE SETUP CARD, FROM THE SERVER. It used to start empty and ask for its
  data from the browser once the page had loaded: a spinner on every visit,
  then the card. The stored state (no Stripe call) is read here and drawn at
  once; the browser then asks Stripe for anything newer.
*/
async function SetupCard({ creatorId, userId }: { creatorId: string; userId: string }) {
  const initial = await overview({ id: creatorId, userId, email: null }, { sync: false }).catch((error: unknown) => {
    console.error("[Payouts] setup card not read on the server:", error instanceof Error ? error.message.slice(0, 160) : "unknown");
    return null;
  });
  return <StorelibPaymentsInline compact initial={initial} />;
}

/* Only on a slow read: invisible for the first 300ms, so a quick one never flashes a skeleton. */
function SetupWaiting() {
  return (
    <div className="animate-in fade-in-0 duration-300 [animation-delay:300ms] [animation-fill-mode:both]">
      <StorelibPaymentsCardLoading />
    </div>
  );
}

/** The client's card (app/app/orders/order-parts `card`), written out: this is a server file. */
const WAIT_CARD = "overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]";

/** The longest Stripe's balance may hold the page's first draw. */
const STRIPE_WAIT_MS = 2_500;
/** The sales list handed to the client: the latest orders, as the one unpaged read always gave it. */
const PAYOUT_LIST_LIMIT = 1_000;

async function PayoutsBody({ creator, paymentsReady, canManage }: { creator: any; paymentsReady: boolean; canManage: boolean }) {
  const { tt } = await getServerTt()
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
    /* Only what the sales list draws from a product (there is no gallery_images column: product.gallery_images below was always empty). */
    adminSupabase.from("products").select("id, title, thumbnail_url, type").eq("creator_id", creator.id),
    stripeAccount
      ? Promise.race([
          Promise.all([
            stripe.balance.retrieve({}, { stripeAccount }),
            stripe.accounts.retrieve(stripeAccount),
          ]).then(
            (value) => ({ ok: true as const, value }),
            (error: unknown) => ({ ok: false as const, error }),
          ),
          /* Stripe does not hold the page: past this the page draws without its balance and the client reads it (PayoutsClient refreshBalances). */
          new Promise<{ ok: false; error: unknown }>((resolve) =>
            setTimeout(() => resolve({ ok: false as const, error: new Error(tt("Stripe took too long")) }), STRIPE_WAIT_MS),
          ),
        ])
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

  /* OnePage tips on the balance, as the ledger has them (run-now part 471): asked now, waited for with the rest. Empty on any failure. */
  const tipsRead = payoutTips(adminSupabase, creator.id);
  const products = productsData || [];
  /* A Map, not a find per order (was products × orders). */
  const productById = new Map<string, any>(products.map((p: any) => [p.id, p]));

  /*
    BY THE ORDER'S OWN CREATOR, EVERY ROW (round rel-db). These were read by a
    list of every product id in the address (too long for a large catalog)
    and unpaged, so the tax year and the disputes stopped at 1,000 rows and
    the 1099-K figures came out low. The tax year's and the disputed orders
    are now read a page at a time (readCreatorOrders); the sales list stays
    the latest PAYOUT_LIST_LIMIT, as the client has always been handed.
  */
  const nothing = { data: null };
  const [ordersRead, taxRead, disputedRead] = await Promise.all([
    latestCreatorOrders<any>(adminSupabase, creator.id, "*", { statuses: ["completed", "refunded", "disputed"], limit: PAYOUT_LIST_LIMIT }).then(
      (data) => ({ data }),
      (error: unknown) => {
        console.error("[Payouts] orders not read:", error instanceof Error ? error.message.slice(0, 160) : "unknown");
        return nothing;
      },
    ),
    readCreatorOrders<{ id: string; amount_cents: number | null; created_at: string; status: string; currency: string | null }>(adminSupabase, creator.id, "id, amount_cents, created_at, status, currency", {
      statuses: ["completed", "refunded", "disputed"],
      since: `${previousYear}-01-01T00:00:00Z`,
    }).then((r) => ({ data: r.rows }), () => nothing),
    readCreatorOrders<{ id: string; amount_cents: number | null; created_at: string; currency: string | null }>(adminSupabase, creator.id, "id, amount_cents, created_at, currency", {
      statuses: ["disputed"],
    }).then((r) => ({ data: r.rows }), () => nothing),
  ]);

  let allOrders: any[] = [];
  const ordersData = ordersRead.data as any[] | null;
  if (ordersData) {
    allOrders = ordersData.map((order) => {
      const product = productById.get(order.product_id);
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
  /* Sales are reported in the store's currency (lib/money/report-currency), each converted at its own day's rate. */
  const salesCurrency = (await readStoreCurrency(adminSupabase, creator.id)).currency.toLowerCase();
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
  /* In US dollars, each sale at its own day's rate: the form and its line are American (lib/money/payout-figures). */
  const taxYears = taxRead.data
    ? await taxYearsInUsd(adminSupabase, creator.id, (taxRead.data as { amount_cents: number | null; created_at: string; currency: string | null }[] | null) || [], currentYear)
    : null;
  const taxData: {
    currentYear: { year: number; grossCents: number; transactionCount: number; isEligible: boolean };
    previousYear: { year: number; grossCents: number; transactionCount: number; isEligible: boolean };
    stripeExpressDashboardUrl: string | null;
  } = {
    currentYear: taxYears?.currentYear ?? { year: currentYear, grossCents: 0, transactionCount: 0, isEligible: false },
    previousYear: taxYears?.previousYear ?? { year: previousYear, grossCents: 0, transactionCount: 0, isEligible: false },
    stripeExpressDashboardUrl: null,
  };

  // Dispute and negative balance figures, from the ledger row and the disputed orders
  /* The ledger keeps its own currency (lib/payments/ledger-currency); disputes are reported in the store's. */
  const negativeBalance = ledger?.negative_balance || 0;
  const disputed = await disputedInStore(adminSupabase, creator.id, (disputedRead.data as { amount_cents: number | null; created_at: string; currency: string | null }[] | null) || [], salesCurrency);
  const activeDisputeCount = disputed.count;
  const totalDisputedAmount = disputed.amountCents;

  return (
    <PayoutsClient
      paymentsReady={paymentsReady}
      canManage={canManage}
      creator={creator}
      initialData={{
        balanceCurrency,
        salesCurrency,
        ledgerCurrency: ledgerCurrency(),
        pendingAmount: stripePendingBalance,
        availableBalance: stripeAvailableBalance,
        stripeRead: !!stripeRead?.ok,
        negativeBalance,
        activeDisputeCount,
        totalDisputedAmount,
        taxData,
      }}
      initialOrders={allOrders}
      initialTips={await tipsRead}
    />
  );
}
