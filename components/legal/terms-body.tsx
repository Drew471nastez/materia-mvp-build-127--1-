/*
  THE TEXT ITSELF, written once. It is drawn by the page at /terms and by the
  sheet a OnePage opens from its footer (components/onepage/onepage-legal-links),
  so the two can never say different things. Colours are read from --legal-*
  variables with Storelib's light values as the fallback: the sheet sets them
  for a dark page.

  Every price, rate and limit is read from the code that charges or enforces it
  (lib/legal/figures), never typed here. Anything only Storelib's owner can
  supply is a <Placeholder>, left visibly open. A draft for review by counsel.
*/
import { LINK, Placeholder, Section, SubSection, Table, Ul } from "./legal-parts"
import {
  FIXED_FEE,
  MEMBERSHIP_GRACE_DAYS,
  PAYOUT_REGIONS,
  SMALL_ORDER_LINE,
  STATEMENT_PREFIX,
  aiEditsSentence,
  emailLimitsSentence,
  feeRows,
  paidPlansSentence,
} from "@/lib/legal/figures"

export const TERMS_TOC = [
  { id: "s1", label: "1. About these terms" },
  { id: "s2", label: "2. Words we use" },
  { id: "s3", label: "3. Who can use Storelib" },
  { id: "s4", label: "4. Your account" },
  { id: "s5", label: "5. Plans and billing" },
  { id: "s6", label: "6. Storelib's fee on sales" },
  { id: "s7", label: "7. Selling on Storelib" },
  { id: "s8", label: "8. Payments, payouts and balances" },
  { id: "s9", label: "9. Refunds, disputes and chargebacks" },
  { id: "s10", label: "10. Buying on Storelib" },
  { id: "s11", label: "11. Your content and our rights" },
  { id: "s12", label: "12. Copyright and other complaints" },
  { id: "s13", label: "13. Rules everyone follows" },
  { id: "s14", label: "14. Integrations and other services" },
  { id: "s15", label: "15. Storelib AI" },
  { id: "s16", label: "16. Explore" },
  { id: "s17", label: "17. The Storelib apps" },
  { id: "s18", label: "18. Suspension, closing and deleting accounts" },
  { id: "s19", label: "19. Disclaimers" },
  { id: "s20", label: "20. Limits on liability" },
  { id: "s21", label: "21. Indemnity" },
  { id: "s22", label: "22. Disputes with Storelib and governing law" },
  { id: "s23", label: "23. Changes" },
  { id: "s24", label: "24. General terms" },
  { id: "s25", label: "25. Contact" },
]

const INK = "font-semibold text-[var(--legal-ink,#1a1a2e)]"
const LOUD = "uppercase font-medium text-[var(--legal-ink,#1a1a2e)]"

export function TermsBody() {
  const fees = feeRows()
  return (
    <>
      <Section id="s1" title="1. About these terms">
        <p>
          These Terms of service are the agreement between you and Storelib Inc. (&ldquo;Storelib&rdquo;, &ldquo;we&rdquo;,
          &ldquo;us&rdquo;) for using storelib.com, its subdomains, storelib.me, the websites, creator pages, OnePages,
          communities and checkouts Storelib hosts, the Storelib apps and every other Storelib service (together,
          &ldquo;Storelib&rdquo; or the &ldquo;Services&rdquo;).
        </p>
        <p>
          By creating an account, selling, buying or otherwise using Storelib you agree to these terms. They include
          our <a href="/privacy" className={LINK}>Privacy policy</a> and our{" "}
          <a href="/refund-policy" className={LINK}>Refund policy</a>. If you sell, the{" "}
          <a href="https://stripe.com/connect-account/legal" target="_blank" rel="noopener noreferrer" className={LINK}>
            Stripe Connected Account Agreement
          </a>{" "}
          also applies to you (section 8). If you do not agree, do not use Storelib.
        </p>
        <p>
          Some parts of these terms apply only to creators who sell, and some only to buyers; the headings say which.
          If you are a consumer, nothing in these terms takes away rights that the law of the country you live in gives
          you and that cannot be excluded by contract.
        </p>
      </Section>

      <Section id="s2" title="2. Words we use">
        <div className="mt-3 space-y-3">
          {[
            ["Creator", "an account holder who uses Storelib to sell, publish a store, website, creator page, OnePage or community, or collect subscribers. Also called a seller."],
            ["Buyer", "anyone who buys, claims a free product, books, tips, joins a paid community or subscribes to a membership from a creator through Storelib, with or without an account."],
            ["Product", "anything a creator offers through Storelib: a download, a course, a membership, a community plan or event ticket, a booking or service, a tip, or a physical product that ships."],
            ["Store", "a creator's products and the places they are sold: their creator page at storelib.com/<name>, their websites, their OnePage, their communities and Explore."],
            ["Explore", "Storelib's public marketplace, where buyers browse products from many creators."],
            ["Content", "anything you upload, write or publish on Storelib: text, pictures, files, videos, product listings, reviews, messages and emails."],
            ["Stripe", "Stripe, Inc. and its affiliates, which process payments for Storelib and hold creators' payout accounts through Stripe Connect."],
          ].map(([term, def]) => (
            <p key={term}>
              <span className={INK}>&ldquo;{term}&rdquo;</span> means {def}
            </p>
          ))}
        </div>
      </Section>

      <Section id="s3" title="3. Who can use Storelib">
        <Ul items={[
          "You must be at least 18, or the age of majority where you live if that is higher, to open an account or to sell. A younger person may buy only with the involvement of a parent or guardian, who is responsible for the purchase.",
          "You must be able to enter a binding contract, and if you use Storelib for a business, you confirm you may bind that business to these terms.",
          "You must not be located in, or ordinarily resident in, a country or region under comprehensive sanctions, and must not be on a sanctions list maintained by the United States, the European Union, the United Kingdom or the United Nations.",
          "You may not use Storelib if we have closed an account of yours before for breaking these terms, unless we agree in writing.",
          `Payouts are available only to creators with a bank account in a country Stripe can pay out to from Storelib, currently ${PAYOUT_REGIONS}.`,
        ]} />
      </Section>

      <Section id="s4" title="4. Your account">
        <SubSection title="4.1 Opening an account">
          <p>
            You sign up with an email address and a password or a one time code, or with Google or Apple. Give accurate
            details and keep them up to date, including the email address we write to.
          </p>
        </SubSection>
        <SubSection title="4.2 Keeping it safe">
          <p>
            Keep your sign in details private. You are responsible for what happens under your account. Tell us at once
            at <a href="mailto:support@storelib.com" className={LINK}>support@storelib.com</a> if you think someone
            else has used it. Settings, Security can sign you out on every device.
          </p>
        </SubSection>
        <SubSection title="4.3 Team members and businesses">
          <p>
            A creator can invite team members to work on their store and can hold more than one store. Team members act
            for the store owner, and the owner is responsible for what they do. Whoever owns a store may hand it over to
            another account through Storelib; the store&apos;s orders, balance and history go with it.
          </p>
        </SubSection>
        <SubSection title="4.4 One person, honest accounts">
          <p>
            Do not open accounts to get around a suspension, a limit, a fee or these terms, and do not pretend to be
            someone else.
          </p>
        </SubSection>
      </Section>

      <Section id="s5" title="5. Plans and billing">
        <SubSection title="5.1 The plans">
          <p>
            Storelib has a Free plan with no monthly fee, and two paid plans: {paidPlansSentence()}. What each plan
            includes is on the <a href="/pricing" className={LINK}>pricing page</a>. Prices are in US dollars and do
            not include any tax that applies to them.
          </p>
        </SubSection>
        <SubSection title="5.2 Renewal">
          <p>
            A paid plan renews automatically every month on the day you started it, and the card on file is charged
            through Stripe each time, until you cancel. By choosing a paid plan you authorise those charges.
          </p>
        </SubSection>
        <SubSection title="5.3 Upgrading">
          <p>
            An upgrade is charged at once: you pay the difference for the rest of the current month, worked out by
            Stripe to the second. The new plan starts only once that payment succeeds. If your bank asks you to confirm
            the payment and you do not, or the card is declined, nothing changes and you stay on your plan.
          </p>
        </SubSection>
        <SubSection title="5.4 Downgrading and cancelling">
          <p>
            A downgrade to a cheaper paid plan, or to Free, takes effect at the end of the month you have paid for; you
            keep your current plan until then. Cancelling works the same way: the plan stays until the end of the paid
            month, then your account moves to Free and its fee. Your products, pages and orders stay as they are,
            except for features your new plan does not include (for example a custom domain). You can cancel in
            Billing at any time.
          </p>
        </SubSection>
        <SubSection title="5.5 Failed payments">
          <p>
            If a renewal payment fails, Stripe tries the card again over the following days and we tell you. You keep
            your plan while it retries. If the payment still fails, the subscription ends and your account moves to
            Free.
          </p>
        </SubSection>
        <SubSection title="5.6 Refunds of plan fees">
          <p>
            Plan fees are not refunded, in full or in part, when you cancel or downgrade, except where the law requires
            it or we charged you by mistake. Paid plans are sold for use in business. See the{" "}
            <a href="/refund-policy" className={LINK}>Refund policy</a>.
          </p>
        </SubSection>
        <SubSection title="5.7 Price changes">
          <p>
            We may change plan prices. We will tell you by email at least{" "}
            <Placeholder>notice period for price changes: to be confirmed by Storelib</Placeholder> before a higher
            price applies to you, and it applies from your next renewal after that. If you do not want to pay it, cancel
            before then. If you subscribed to a plan or price we no longer offer, you keep it while your subscription
            stays active, unless we tell you otherwise with the same notice.
          </p>
        </SubSection>
      </Section>

      <Section id="s6" title="6. Storelib's fee on sales">
        <p>
          Storelib takes a fee from each sale paid through Storelib. The rate depends on your plan and on whether the
          product ships. On an order of {SMALL_ORDER_LINE} or more, the fee is the rate below plus {FIXED_FEE} for the
          order:
        </p>
        {/* Every rate from the fee rules checkout charges by (lib/billing/fee-calculator, through lib/legal/figures), never typed. */}
        <Table
          head={["Plan", "Price", "Digital products", "Products that ship"]}
          rows={fees.map((f) => [f.name, f.price, f.digital, f.physical])}
        />
        <p>
          On an order under {SMALL_ORDER_LINE} the {FIXED_FEE} is dropped and a higher rate applies instead, so a small
          order never pays more than one at {SMALL_ORDER_LINE}:{" "}
          {fees.map((f) => `${f.name} ${f.smallDigital} for digital and ${f.smallPhysical} for physical`).join("; ")}.
          Orders in another currency use the same rules at an equivalent amount, set per currency in our fee rules.
        </p>
        <Ul items={[
          "An order with both kinds of product pays each product's own rate, with one fixed fee for the order. Delivery, cash on delivery charges and tax on an order that ships pay the rate for products that ship.",
          "Digital includes downloads, courses, memberships, communities, event tickets, bookings and tips.",
          "A paid plan's rate applies while its subscription is active; otherwise the Free rate applies.",
          "The fee is kept back from the payment before your share reaches your balance. Payouts shows the fee on every sale and the rule it came from.",
          "Storelib's fee is not returned when a sale is refunded or lost in a dispute.",
          "Today Storelib pays Stripe's card processing cost on Storelib sales out of its fee. Stripe may charge you separately under your agreement with Stripe, for example when it converts a sale into your payout currency.",
          "Orders paid in cash on delivery do not pass through Storelib and pay no fee.",
        ]} />
        <p>
          We may change the fee with notice as described in section 23. A change applies to sales made after it takes
          effect.
        </p>
      </Section>

      <Section id="s7" title="7. Selling on Storelib">
        <SubSection title="7.1 You are the seller">
          <p>
            When you sell through Storelib, the contract of sale is between you and the buyer. You are the seller, and
            you are responsible for your products, your listings, delivering what you sold, customer service, refunds,
            returns and the rights buyers have under consumer law. Storelib provides the software and takes the payment
            for you through Stripe; Storelib is not the seller, is not a merchant of record, and does not take title to
            your products.
          </p>
        </SubSection>
        <SubSection title="7.2 Taxes">
          <p>
            You are responsible for working out, charging, reporting and paying any tax due on your sales (sales tax,
            VAT, GST and the like). Settings, Taxes lets you set the rates your store charges; Storelib charges what
            you set, never a rate it made up, and does not file or pay tax for you. Where Storelib turns on Stripe Tax
            for memberships, Stripe calculates that tax; responsibility for paying it stays with you unless the law
            makes Storelib responsible. We may share sales information with tax authorities where the law requires it.
          </p>
        </SubSection>
        <SubSection title="7.3 Listings and delivery">
          <Ul items={[
            "Describe each product accurately: what it is, what the buyer gets, any license terms, delivery times and costs, and anything that limits its use.",
            "Upload complete, working files free of malware. Storelib checks uploads and may block a file it finds harmful.",
            "Downloads are delivered by email and in the buyer's library as soon as payment succeeds. Buyers keep access to what they bought even if you archive the product later.",
            "Ship physical products within the time you state, with tracking where you can, and keep your stock and delivery settings right.",
            "Deliver bookings, events and services as described, at the time agreed.",
          ]} />
        </SubSection>
        <SubSection title="7.4 Your refund and return policy">
          <p>
            You decide your refund policy and, for products that ship, your return window, and you show them to buyers
            before they pay. Whatever you decide cannot take away buyers&apos; rights under the law. The{" "}
            <a href="/refund-policy" className={LINK}>Refund policy</a> explains how refunds work on Storelib and what
            applies when you have not stated a policy.
          </p>
        </SubSection>
        <SubSection title="7.5 Consumer law">
          <p>
            You give buyers the information the law requires before they pay and after (who you are, how to contact
            you, the total price, cancellation and withdrawal rights). If you sell to consumers in the EEA or the UK,
            they usually have 14 days to withdraw from a purchase. Storelib currently asks for the buyer&apos;s consent
            to start at once, and their acknowledgement that the right then ends, only at the checkout of community
            memberships; for other products you are responsible for handling withdrawal requests.
          </p>
        </SubSection>
        <SubSection title="7.6 What you must not sell">
          <Ul items={[
            "Anything illegal where you or your buyers are, or that infringes someone's copyright, trademark, privacy or other rights",
            "Stolen, pirated or resold content you have no right to sell, including products bought on Storelib or elsewhere",
            "Malware, spyware, or tools made for hacking, phishing, spam or fraud",
            "Sexual content involving minors, in any form, and content that sexually exploits anyone",
            "Content that promotes violence, terrorism, hatred or harassment of people for who they are",
            "Weapons, explosives, drugs, controlled substances and drug paraphernalia, prescription medicines, tobacco and nicotine products",
            "Personal data, accounts, credentials or identity documents of other people",
            "Get rich quick schemes, pyramid schemes, misleading financial or health claims, and products whose main purpose is to deceive",
            "Gambling, lotteries and securities, unless we have agreed in writing",
            "Anything Stripe's restricted business list does not allow",
          ]} />
          <p>We may remove a product or listing that breaks this section or that we reasonably believe is unlawful.</p>
        </SubSection>
        <SubSection title="7.7 Reviews">
          <p>
            Storelib Reviews lets buyers rate what they bought. Do not write, buy or reward reviews of your own products,
            and do not import reviews that are not genuine reviews of that product by its buyers. We may remove reviews
            that break these terms.
          </p>
        </SubSection>
        <SubSection title="7.8 Email you send">
          <p>
            You may email only people who subscribed to you or bought from you, and you must comply with anti spam law
            (for example CAN-SPAM, the GDPR and the ePrivacy rules, and CASL). Every campaign carries an unsubscribe
            link, and Storelib stops sending to anyone who uses it. Campaign emails per calendar month, by plan:{" "}
            {emailLimitsSentence()}.
          </p>
        </SubSection>
        <SubSection title="7.9 Buyer data">
          <p>
            You receive your buyers&apos; and subscribers&apos; names, email addresses and, for orders that ship, delivery
            details. You are the controller of that data under data protection law and must use it only as the law
            allows and as your own privacy notice says. Storelib processes it for you as described in the{" "}
            <a href="/privacy#s10" className={LINK}>Privacy policy</a> and our data processing terms{" "}
            <Placeholder>link to Storelib&apos;s data processing agreement: to be published by Storelib</Placeholder>.
          </p>
        </SubSection>
        <SubSection title="7.10 Domains, websites and pages">
          <p>
            On plans that include it you can connect your own domain. You must own or have the right to use it and keep
            it registered; we are not responsible for problems at your registrar. You are responsible for everything on
            your store, websites, creator page, OnePage and communities, including the policies they show.
          </p>
        </SubSection>
        <SubSection title="7.11 Physical products and partners">
          <p>
            If you ship goods yourself or through a partner you connect (a print on demand, dropshipping, fulfilment or
            shipping service), you remain the seller. Storelib sends each paid order to the partner you chose, as you
            set it up; the partner&apos;s own terms apply between you and them. You can offer cash on delivery on
            orders where everything ships; that money is between you and the buyer.
          </p>
        </SubSection>
        <SubSection title="7.12 Communities, memberships, events and bookings">
          <p>
            Memberships and community plans renew until the member cancels; you set their price, what they include and
            their refund policy, which the checkout shows. A member whose renewal fails keeps access for{" "}
            {MEMBERSHIP_GRACE_DAYS} days while the card is retried. Event tickets and bookings follow the refund window
            and cancellation terms you set for them.
          </p>
        </SubSection>
        <SubSection title="7.13 Imports">
          <p>
            You may import your own products and reviews from other platforms (for example Gumroad, Shopify or
            Payhip). Import only what you own or have the right to use.
          </p>
        </SubSection>
      </Section>

      <Section id="s8" title="8. Payments, payouts and balances">
        <SubSection title="8.1 Stripe">
          <p>
            Payments on Storelib are processed by Stripe through Stripe Connect. To sell you set up a payout account
            with Stripe through Storelib and agree to the{" "}
            <a href="https://stripe.com/connect-account/legal" target="_blank" rel="noopener noreferrer" className={LINK}>
              Stripe Connected Account Agreement
            </a>
            , which includes the{" "}
            <a href="https://stripe.com/legal/ssa" target="_blank" rel="noopener noreferrer" className={LINK}>
              Stripe Services Agreement
            </a>
            . You authorise Storelib to give Stripe instructions about your payments, payouts, refunds and reversals.
            Storelib is not a bank or a money transmitter and does not hold your money; your balance is held by
            Stripe.
          </p>
        </SubSection>
        <SubSection title="8.2 Identity verification">
          <p>
            The law and the card networks require Stripe to verify who you are before you can be paid. Stripe may ask
            for an identity document, a photo of your face compared with it, your date of birth, address, tax number
            and, for a business, its registration and owners. Storelib passes what you type or photograph to Stripe
            and does not keep it (see the <a href="/privacy#s5" className={LINK}>Privacy policy</a>). Until
            verification is complete, checkout stays closed and payouts are unavailable, and Stripe may ask for more at
            any time.
          </p>
        </SubSection>
        <SubSection title="8.3 How a sale is paid">
          <p>
            Each sale is charged on Storelib&apos;s Stripe account and your share, the payment less Storelib&apos;s fee,
            is transferred to your Stripe account in the same charge. The buyer&apos;s bank statement shows{" "}
            {STATEMENT_PREFIX}* followed by your store&apos;s name, or the name you choose in Settings, Payments.
          </p>
        </SubSection>
        <SubSection title="8.4 Balance and Cash out">
          <p>
            Your share is pending until Stripe makes it available, which depends on your country and account and is
            often about seven days for a new account. Payouts shows the date for each sale. You send your available
            balance to your bank with Cash out; it usually arrives in a few business days. Payouts are in your Stripe
            account&apos;s currency. We do not guarantee settlement or arrival times.
          </p>
        </SubSection>
        <SubSection title="8.5 Holds and reserves">
          <p>
            Storelib or Stripe may hold or delay a payout, or keep part of your balance back for a period, where we
            reasonably need to: to cover likely refunds or disputes, while we look into suspected fraud or a breach of
            these terms, when your products have not been delivered, or when the law, the card networks or Stripe
            require it. We will tell you why unless the law or a risk of fraud prevents us.
          </p>
        </SubSection>
        <SubSection title="8.6 A balance below zero">
          <p>
            A refund, a reversal or a lost dispute can take your balance below zero. You owe that amount. It is
            recovered from your next sales before anything else is paid out, and Cash out is unavailable until your
            balance is above zero. If it is not recovered within a reasonable time, we may ask Stripe to debit the
            bank account on file where the law allows, or recover it from you in other lawful ways.
          </p>
        </SubSection>
      </Section>

      <Section id="s9" title="9. Refunds, disputes and chargebacks">
        <p>
          How refunds work is in the <a href="/refund-policy" className={LINK}>Refund policy</a>, which is part of these
          terms. In short:
        </p>
        <Ul items={[
          "Creators refund their own sales from Orders, in full or in part. The refunded amount is taken from the creator's share; Storelib's fee is not returned.",
          "A full refund of a digital product closes the buyer's access to it. A partial refund does not.",
          "Storelib may refund a buyer on a creator's behalf where the law, the card network rules or these terms require it, for example when a product was never delivered, and recovers the amount from the creator's balance.",
        ]} />
        <SubSection title="9.1 Disputes and chargebacks">
          <p>
            A buyer may ask their bank to reverse a payment. Because the payment was taken on Storelib&apos;s Stripe
            account, Storelib answers the bank, using evidence the creator adds under Disputes in Payouts. While the
            case is open, the creator&apos;s share of that sale is taken back from their balance; it is returned if the
            bank decides for the creator. If the creator loses, the amount stays with the buyer and the buyer&apos;s
            access to a digital product they bought once ends. The bank decides, not Storelib or Stripe.
          </p>
          <p>
            Today Storelib pays the dispute fee Stripe charges. We may pass it on to creators after notice under
            section 23. A membership is not ended automatically by a dispute; the creator or Storelib may end the
            member&apos;s access. We may restrict selling or payouts for a creator with a high rate of disputes or
            refunds, and may close the account of a buyer who files disputes in bad faith.
          </p>
        </SubSection>
      </Section>

      <Section id="s10" title="10. Buying on Storelib">
        <SubSection title="10.1 Who you buy from">
          <p>
            You buy from the creator, not from Storelib. The creator is responsible for the product, its delivery and
            its description, and for any refund or return. The checkout names the store you are buying from. Some
            checkouts ask you to tick a box to agree to these terms and the Refund policy, and to the creator&apos;s own
            policy where they show one.
          </p>
        </SubSection>
        <SubSection title="10.2 Prices and payment">
          <p>
            The checkout shows the total you pay, with delivery and tax where they apply, before you pay. Payment is
            taken by Stripe; Storelib never sees your full card number. On a creator&apos;s own website prices are in the
            store&apos;s currency; on storelib.com they are in US dollars, converted from the creator&apos;s price at the
            day&apos;s rate where needed.
          </p>
        </SubSection>
        <SubSection title="10.3 Getting what you bought">
          <Ul items={[
            "Downloads and courses: by email, on the receipt page, and in your library if you have an account. Download links are limited to protect the creator, and the limits are well above normal use.",
            "Memberships and communities: access while the membership is active, until you cancel or it ends.",
            "Physical products: shipped by the creator or their partner; your order page shows tracking. Before an order is in progress you can cancel it from the order page.",
          ]} />
        </SubSection>
        <SubSection title="10.4 License">
          <p>
            Unless the creator&apos;s listing says otherwise, a digital product is licensed to you for your own personal
            use, not sold. You may not share, resell or publish it. The creator&apos;s own license terms, where they give
            them, decide what else you may do.
          </p>
        </SubSection>
        <SubSection title="10.5 Help with an order">
          <p>
            Use Need help with this order? on your receipt or order page to reach the store. If the store has not
            answered within three days on a question about the goods or a refund, you can ask Storelib to step in from
            the same place. Our <a href="/refund-policy" className={LINK}>Refund policy</a> says what to expect.
          </p>
        </SubSection>
        <SubSection title="10.6 Reviews">
          <p>
            You may review what you bought. Reviews must be honest and about your own experience. We may remove a review
            that breaks these terms.
          </p>
        </SubSection>
      </Section>

      <Section id="s11" title="11. Your content and our rights">
        <SubSection title="11.1 Your content stays yours">
          <p>
            You keep ownership of your content. You give Storelib a worldwide, nonexclusive, royalty free license to
            host, store, copy, adapt (for example resize, translate or format), display and distribute your content,
            and to show it in Explore, in search results and in Storelib&apos;s own promotion of your store, only as
            needed to run, improve and promote Storelib. The license ends when you delete the content or your account,
            except for copies buyers already have, content others have shared, and backups kept for a limited time.
          </p>
        </SubSection>
        <SubSection title="11.2 You have the rights">
          <p>
            You confirm you own or have permission for all content you publish, including music, fonts, pictures and
            anything an AI produced for you, and that it does not break the law or these terms.
          </p>
        </SubSection>
        <SubSection title="11.3 Storelib's rights">
          <p>
            Storelib&apos;s software, design, themes, brand and documentation belong to Storelib and its licensors. You
            may use them only to use Storelib as these terms allow. A theme you get from Storelib may be used for your
            own store on Storelib. If you send us ideas or feedback, we may use them without paying you.
          </p>
        </SubSection>
      </Section>

      <Section id="s12" title="12. Copyright and other complaints">
        <p>
          If you believe content on Storelib infringes your copyright, send a notice to{" "}
          <a href="mailto:legal@storelib.com" className={LINK}>legal@storelib.com</a> with:
        </p>
        <Ul items={[
          "the work you say is infringed, and the address of the content on Storelib",
          "your name, postal address, telephone number and email address",
          "a statement that you believe in good faith the use is not authorised by the owner, its agent or the law",
          "a statement, under penalty of perjury, that your notice is accurate and that you are the owner or authorised to act for them",
          "your physical or electronic signature",
        ]} />
        <p>
          Storelib&apos;s designated agent under the US Digital Millennium Copyright Act is{" "}
          <Placeholder>name and postal address of the DMCA designated agent, registered with the US Copyright Office: to be confirmed by Storelib</Placeholder>.
        </p>
        <p>
          We remove or disable the content and tell the person who posted it. They may send a counter notice to the
          same address with the content&apos;s address, a statement under penalty of perjury that it was removed by
          mistake, their name, address and telephone number, consent to the jurisdiction of the courts where they
          live (or, outside the US, any court where Storelib may be found), and their signature. We may restore the
          content after 10 business days unless the complainant tells us they have gone to court. We close the
          accounts of repeat infringers.
        </p>
        <p>
          To report anything else that breaks the law or these terms, use Report on the product or page, or write to{" "}
          <a href="mailto:support@storelib.com" className={LINK}>support@storelib.com</a>. We look at every report and
          tell you what we decided where we can.
        </p>
      </Section>

      <Section id="s13" title="13. Rules everyone follows">
        <p>You agree not to:</p>
        <Ul items={[
          "break the law, or help anyone else do so, through Storelib",
          "deceive or defraud anyone, or pretend to be someone else",
          "harass, threaten or abuse anyone",
          "send spam or messages people did not ask for",
          "collect other people's personal data without a lawful basis",
          "upload malware, or try to get into accounts, systems or data that are not yours",
          "test, scan or overload Storelib's systems, or get around its security, limits or fees",
          "scrape Storelib or use bots against it without our written permission, except for search engines following robots.txt",
          "copy, decompile or reverse engineer Storelib except as the law allows",
          "manipulate reviews, rankings, analytics or Explore",
          "use Storelib to build a competing service from its content or data",
        ]} />
      </Section>

      <Section id="s14" title="14. Integrations and other services">
        <p>
          You can connect other services to your store: analytics and advertising tags, email platforms, print on
          demand and shipping partners, calendars, Discord and Telegram, webhooks and others. When you connect one, you
          tell Storelib to send it the data the integration needs, and that service&apos;s own terms and privacy
          policy apply to you. Storelib does not control them and is not responsible for them. If you add tracking
          tags to your website, you are responsible for having a lawful basis and the consent the law requires; the{" "}
          <a href="/privacy#s6" className={LINK}>Privacy policy</a> explains what Storelib does to help.
        </p>
      </Section>

      <Section id="s15" title="15. Storelib AI">
        <p>
          Storelib AI builds and edits websites, pages, text and pictures from what you ask. To answer, Storelib sends
          your request and the store content it needs to the AI provider that runs the model (see the{" "}
          <a href="/privacy#s8" className={LINK}>Privacy policy</a>). You may also connect your own Anthropic or OpenAI
          key, in which case your agreement with that provider applies to its use.
        </p>
        <Ul items={[
          "AI output can be wrong, can look like other people's work and can repeat what others received. Check it before you publish it; you are responsible for what you publish.",
          "Do not use Storelib AI to make content these terms forbid, or to make claims about real products, prices or reviews that are not true.",
          `AI edits a month, by plan: ${aiEditsSentence()}.`,
        ]} />
      </Section>

      <Section id="s16" title="16. Explore">
        <p>
          Published digital products can appear on Explore, Storelib&apos;s marketplace, unless you turn Explore off for
          a product in its sales channels. Physical products are sold on your own website only. We decide what Explore
          shows and in what order, using things like relevance, recency, ratings and sales, and we may leave out or
          remove a product at any time. Placement is not guaranteed and is not paid for.
        </p>
      </Section>

      <Section id="s17" title="17. The Storelib apps">
        <p>
          The Storelib app for iPhone and iPad is available from Apple&apos;s App Store, and the App Store&apos;s terms
          also apply to it. Apple is not responsible for the app or its support. The app may send push notifications
          you can turn off in your device settings, and some updates may be needed to keep using it.
        </p>
      </Section>

      <Section id="s18" title="18. Suspension, closing and deleting accounts">
        <SubSection title="18.1 Deleting your account">
          <p>
            You can delete your account in Settings, Security, confirmed with a code we email you. A creator with money
            pending, available, on its way or owed, or a dispute still open, settles it first. An account that has
            sold, been paid out or been billed is retired rather than wiped: the store goes offline, your personal
            details are erased, and the orders, refunds, payouts and invoices are kept as financial records. Buyers keep
            what they bought. Cancel a paid plan first so you are not charged again; deleting does not refund plan
            fees.
          </p>
        </SubSection>
        <SubSection title="18.2 What we may do">
          <p>
            We may remove content, limit features, pause payouts, suspend or close an account, or refuse service, where
            we reasonably believe it is needed: for a breach of these terms, fraud or a risk of it, illegal content, a
            legal or regulatory request, a high rate of disputes, failure to complete verification, or to protect
            buyers, creators, Storelib or others. Where we can, we tell you first, give the reason and let you respond.
            You can ask us to look again at a decision by writing to{" "}
            <a href="mailto:support@storelib.com" className={LINK}>support@storelib.com</a>.
          </p>
        </SubSection>
        <SubSection title="18.3 After an account closes">
          <Ul items={[
            "The store, websites and pages go offline and new sales stop.",
            "Money owed to you is paid out once refunds, disputes and holds that apply have been settled. Money you owe stays owed.",
            "Buyers keep access to products they already bought, unless the product is removed for breaking the law or these terms.",
            "Sections that by their nature should continue, such as fees owed, licenses buyers hold, disclaimers, limits on liability, indemnity and disputes, continue.",
          ]} />
        </SubSection>
      </Section>

      <Section id="s19" title="19. Disclaimers">
        <p className={LOUD}>
          Storelib is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. To the fullest extent the law allows,
          Storelib gives no warranties, express or implied, including of merchantability, fitness for a particular
          purpose, title and non infringement, and does not promise that Storelib will be uninterrupted, secure or free
          of errors, or that you will make any sales.
        </p>
        <p>
          Storelib does not make, check or guarantee creators&apos; products and is not responsible for them. Some
          countries do not allow these exclusions; there, they apply only as far as the law allows.
        </p>
      </Section>

      <Section id="s20" title="20. Limits on liability">
        <p className={LOUD}>
          To the fullest extent the law allows, Storelib and its officers, employees and suppliers are not liable for
          indirect, incidental, special, consequential or punitive damages, or for lost profits, revenue, data or
          goodwill, arising from Storelib or these terms. Storelib&apos;s total liability for all claims is limited to the
          greater of the fees you paid Storelib (plan fees and Storelib&apos;s fees on your sales) in the twelve months
          before the claim, and one hundred US dollars.
        </p>
        <p>
          Nothing in these terms limits liability for death or personal injury caused by negligence, for fraud, or for
          anything else the law does not allow to be limited. If you are a consumer in the EEA or the UK, Storelib is
          responsible for loss you suffer that is a foreseeable result of our breach of these terms or our negligence.
        </p>
      </Section>

      <Section id="s21" title="21. Indemnity">
        <p>
          If you sell on Storelib, you will defend and compensate Storelib, its officers and employees against claims,
          losses, fines and reasonable costs (including legal fees) from third parties or authorities that arise from
          your products, your content, your sales and taxes, your use of buyer data, or your breach of these terms or
          the law. This does not apply to the extent a claim is caused by Storelib. Consumers who only buy do not give
          this indemnity.
        </p>
      </Section>

      <Section id="s22" title="22. Disputes with Storelib and governing law">
        <SubSection title="22.1 Talk to us first">
          <p>
            If you have a problem with Storelib, write to{" "}
            <a href="mailto:legal@storelib.com" className={LINK}>legal@storelib.com</a> and give us 30 days to try to
            put it right before starting any claim.
          </p>
        </SubSection>
        <SubSection title="22.2 Governing law">
          <p>
            These terms are governed by the laws of the State of Delaware, United States, without regard to its conflict
            of laws rules{" "}
            <Placeholder>governing law and venue: confirm with counsel that Delaware matches Storelib&apos;s place of incorporation</Placeholder>
            . If you are a consumer, you also keep the protection of the mandatory laws of the country where you live,
            and you may bring a claim in its courts.
          </p>
        </SubSection>
        <SubSection title="22.3 Arbitration and class actions">
          <p>
            Except for claims in small claims court and claims about intellectual property, any dispute between you and
            Storelib that is not resolved informally will be decided by binding individual arbitration administered by
            the American Arbitration Association under its rules, in English. You may opt out of this section within
            30 days of first accepting these terms by writing to legal@storelib.com.
          </p>
          <p className={LOUD}>
            To the fullest extent the law allows, you and Storelib bring claims only individually, not as a plaintiff or
            class member in a class, consolidated or representative action.
          </p>
          <p>
            This section 22.3 does not apply to consumers in the EEA, the UK or Switzerland, or anywhere else the law
            does not allow it.
          </p>
        </SubSection>
      </Section>

      <Section id="s23" title="23. Changes">
        <p>
          We may change Storelib, its features and these terms. If a change to these terms or to our fees materially
          affects you, we will tell you by email or in Storelib at least{" "}
          <Placeholder>notice period for changes to the terms and fees: to be confirmed by Storelib</Placeholder>{" "}
          before it takes effect, unless it is needed sooner for legal or security reasons. If you do not agree, you
          can stop using Storelib and close your account before the change takes effect; continuing to use Storelib
          after that means you accept it. The date at the top of this page shows when these terms last changed.
        </p>
      </Section>

      <Section id="s24" title="24. General terms">
        <Ul items={[
          "Entire agreement: these terms, with the Privacy policy, the Refund policy and any terms shown for a specific feature, are the whole agreement between you and Storelib about Storelib.",
          "Severability: if part of these terms cannot be enforced, the rest still applies, and that part is applied as far as it can be.",
          "No waiver: if we do not enforce a term straight away, we can still enforce it later.",
          "Assignment: you may not transfer these terms without our written consent, except by handing over a store through Storelib. We may transfer them to a company that takes over Storelib, and we will tell you.",
          "Events beyond control: neither of us is responsible for delays or failures caused by events outside reasonable control, such as outages of providers, networks or payment systems, disasters, war or government action.",
          "Confidential information: keep non public information Storelib shares with you, for example about features not yet released, confidential.",
          "Notices: we send notices to the email address on your account or show them in Storelib. You send notices to legal@storelib.com.",
          "Language: these terms are written in English; a translation is for convenience, and the English text applies if they differ, unless the law requires otherwise.",
          "No third party rights: nobody else may enforce these terms, except as the law gives them that right.",
        ]} />
      </Section>

      <Section id="s25" title="25. Contact">
        <div className="mt-3 space-y-1 rounded-2xl bg-[var(--legal-panel,#f8f9fa)] p-4 text-[14px]">
          <p>
            <span className="font-medium text-[var(--legal-ink,#1a1a2e)]">Legal and copyright:</span>{" "}
            <a href="mailto:legal@storelib.com" className={LINK}>legal@storelib.com</a>
          </p>
          <p>
            <span className="font-medium text-[var(--legal-ink,#1a1a2e)]">Support, billing and refunds:</span>{" "}
            <a href="mailto:support@storelib.com" className={LINK}>support@storelib.com</a>
          </p>
          <p>
            <span className="font-medium text-[var(--legal-ink,#1a1a2e)]">Privacy:</span>{" "}
            <a href="mailto:privacy@storelib.com" className={LINK}>privacy@storelib.com</a>
          </p>
          <p>
            <span className="font-medium text-[var(--legal-ink,#1a1a2e)]">Company:</span> Storelib Inc.,{" "}
            <Placeholder>registered address and company number: to be confirmed by Storelib</Placeholder>
          </p>
        </div>
      </Section>
    </>
  )
}
