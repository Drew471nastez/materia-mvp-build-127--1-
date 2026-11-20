/*
  THE TEXT ITSELF, written once. It is drawn by the page at /privacy and by the
  sheet a OnePage opens from its footer (components/onepage/onepage-legal-links),
  so the two can never say different things. Colours are read from --legal-*
  variables with Storelib's light values as the fallback: the sheet sets them
  for a dark page.

  The service providers and the tools a creator can connect are drawn from
  lib/legal/processors, the cookies from lib/consent/consent (./cookie-table),
  and the plan limits from lib/legal/figures, so none of them is typed here.
  Anything only Storelib's owner can supply is a <Placeholder>. A draft for
  review by counsel.
*/
import { LINK, Placeholder, Section, SubSection, Table, Ul } from "./legal-parts"
import { CookieTable } from "./cookie-table"
import { PROCESSORS, creatorTools } from "@/lib/legal/processors"
import { emailLimitsSentence } from "@/lib/legal/figures"

export const PRIVACY_TOC = [
  { id: "s1", label: "1. About this policy" },
  { id: "s2", label: "2. Who we are and our role" },
  { id: "s3", label: "3. What we collect" },
  { id: "s4", label: "4. Why we use it, and our legal bases" },
  { id: "s5", label: "5. Payments, verification and Stripe" },
  { id: "s6", label: "6. Analytics, tracking and cookies" },
  { id: "s7", label: "7. Email and notifications" },
  { id: "s8", label: "8. Storelib AI" },
  { id: "s9", label: "9. Who we share it with" },
  { id: "s10", label: "10. Data creators collect through Storelib" },
  { id: "s11", label: "11. International transfers" },
  { id: "s12", label: "12. How long we keep it" },
  { id: "s13", label: "13. Security" },
  { id: "s14", label: "14. Your rights" },
  { id: "s15", label: "15. US state privacy notice" },
  { id: "s16", label: "16. Children" },
  { id: "s17", label: "17. The Storelib apps" },
  { id: "s18", label: "18. Changes to this policy" },
  { id: "s19", label: "19. Contact" },
]

const INK = "font-semibold text-[var(--legal-ink,#1a1a2e)]"

export function PrivacyBody() {
  const tools = creatorTools()
  return (
    <>
      <Section id="s1" title="1. About this policy">
        <p>
          This policy explains what personal data Storelib Inc. (&ldquo;Storelib&rdquo;, &ldquo;we&rdquo;) collects when
          you use storelib.com, storelib.me, the websites, creator pages, OnePages, communities and checkouts we host,
          and the Storelib apps; why; who receives it; how long we keep it; and the choices and rights you have. It
          covers creators who sell on Storelib, their team members, buyers, subscribers, community members and
          visitors.
        </p>
        <p>
          It works with our <a href="/terms" className={LINK}>Terms of service</a> and our{" "}
          <a href="/refund-policy" className={LINK}>Refund policy</a>. Words such as creator, buyer and store mean what
          the Terms say they mean.
        </p>
      </Section>

      <Section id="s2" title="2. Who we are and our role">
        <p>
          <span className={INK}>Storelib is the controller</span> of the data about creators&apos; and team
          members&apos; accounts, plan billing, Storelib&apos;s own website and marketing, Explore, security and fraud
          prevention, and the support you ask us for.
        </p>
        <p>
          <span className={INK}>Each creator is the controller</span> of the data about their own buyers, subscribers,
          community members and website visitors: the orders, email lists, bookings, form answers and the like that
          come through their store. Storelib processes that data on the creator&apos;s behalf, to run their store, and
          for our own legitimate purposes of keeping Storelib secure, preventing fraud, keeping financial records and
          meeting the law. If you bought from or subscribed to a creator, the creator&apos;s own privacy notice also
          applies, and you can ask them about your data. See section 10.
        </p>
        <p>
          <span className={INK}>Stripe is an independent controller</span> of the payment and identity verification
          data it collects (section 5).
        </p>
        <div className="mt-3 space-y-1 rounded-2xl bg-[var(--legal-panel,#f8f9fa)] p-4 text-[14px]">
          <p>
            <span className="font-medium text-[var(--legal-ink,#1a1a2e)]">Controller:</span> Storelib Inc.,{" "}
            <Placeholder>registered address: to be confirmed by Storelib</Placeholder>
          </p>
          <p>
            <span className="font-medium text-[var(--legal-ink,#1a1a2e)]">Privacy contact:</span>{" "}
            <a href="mailto:privacy@storelib.com" className={LINK}>privacy@storelib.com</a>
          </p>
          <p>
            <span className="font-medium text-[var(--legal-ink,#1a1a2e)]">Data protection officer:</span>{" "}
            <Placeholder>name or role and contact, if Storelib appoints one: to be confirmed by Storelib</Placeholder>
          </p>
          <p>
            <span className="font-medium text-[var(--legal-ink,#1a1a2e)]">EU and UK representative:</span>{" "}
            <Placeholder>needed under GDPR article 27 if Storelib has no establishment in the EU or the UK: to be confirmed by Storelib</Placeholder>
          </p>
        </div>
      </Section>

      <Section id="s3" title="3. What we collect">
        <SubSection title="3.1 Creators and team members">
          <Ul items={[
            "Account: name, email address, password (stored only as a hash by our sign in provider) or the Google or Apple account you sign in with, profile picture, username, country, language and time zone.",
            "Store: store name, addresses and contact details you publish, products, files, prices, websites, pages, communities, emails you write, settings and the integrations you connect, with their keys (kept on our servers, never shown back in full).",
            "Payouts: the details you give to set up payouts, passed to Stripe (section 5). We keep only your Stripe account id, verification status, country, payout currency and the last four digits of your bank account.",
            "Billing: your plan, invoices and the payment method Stripe holds for your subscription.",
            "Team: who you invite to your store, their role, and a log of changes made to the store (Settings, Activity).",
            "Support: what you write to us, and the orders or cases it is about.",
          ]} />
        </SubSection>
        <SubSection title="3.2 Buyers, subscribers and members">
          <Ul items={[
            "Your name and email address, and for orders that ship, the delivery address and, where the store asks for it, a phone number and company details.",
            "What you bought, when, for how much, in which currency, with any discount, tax, tip and refund, and whether you downloaded it.",
            "Payment: Stripe takes your card or wallet details. We receive the card brand, its last four digits, its country and the payment's status, never the full number.",
            "Anything you give a creator through Storelib: answers to checkout or form questions, files or photos for a personalised product, booking details, messages about an order, reviews and community posts.",
            "If you create an account on a creator's website or on Storelib: your sign in details, library, wishlist and purchases.",
            "If you join a community with Discord or Telegram roles: your Discord or Telegram account id.",
          ]} />
        </SubSection>
        <SubSection title="3.3 Everyone who visits">
          <Ul items={[
            "The pages you view on Storelib and on the stores it hosts, where the visit came from (the referring site, search, social apps, email, utm tags and ad click ids), your browser and device type, and your country and region from your IP address.",
            "Your IP address while each request is served, for security, fraud prevention and rate limits. Our analytics does not store it (section 6).",
            "Your cookie choices and the cookies and similar items listed in section 6.",
            "Error and performance information from our website and apps, to fix problems.",
          ]} />
        </SubSection>
        <SubSection title="3.4 From others">
          <Ul items={[
            "Stripe: payment, refund, dispute and payout events, and creators' verification status.",
            "Google and Apple, if you sign in with them: your name, email address and profile picture.",
            "Tools a creator connects: for example a calendar's busy times, a carrier's tracking events, or Discord confirming your role.",
            "Creators who import their own products, subscribers or reviews from another platform.",
          ]} />
        </SubSection>
      </Section>

      <Section id="s4" title="4. Why we use it, and our legal bases">
        <p>Where the GDPR or the UK GDPR applies, we rely on these legal bases:</p>
        <Table
          head={["What we do", "Legal basis"]}
          rows={[
            ["Run accounts, stores, checkouts, delivery, payouts, plans and support", "Contract with you; for buyers' data handled for creators, the creator's basis"],
            ["Send receipts, sign in codes, order and account notices", "Contract"],
            ["Keep financial, tax and accounting records; answer lawful requests", "Legal obligation"],
            ["Prevent fraud, abuse and spam; secure Storelib; enforce the Terms", "Legitimate interests"],
            ["Count visits without storing anything on your device; improve Storelib", "Legitimate interests"],
            ["Count returning visitors with a cookie, and Vercel Analytics", "Consent"],
            ["Preference cookies that remember how you lay out lists", "Consent"],
            ["A creator's advertising and analytics tags in the EEA, the UK and Switzerland", "Consent (asked on the creator's site; the creator is responsible)"],
            ["Optional emails to creators with tips about using Storelib", "Legitimate interests; you can turn them off. Storelib sends no marketing emails without consent"],
            ["Push notifications", "Consent, through your device or browser"],
          ]}
        />
        <p>
          Where we rely on legitimate interests, we have weighed them against your rights, and you can object (section
          14). Where we rely on consent, you can withdraw it at any time without affecting what happened before.
        </p>
        <p>
          We do not make decisions that have legal or similarly significant effects on you based solely on automated
          processing. Automated checks for fraud, spam and malware can hold an action for a person to review.
        </p>
      </Section>

      <Section id="s5" title="5. Payments, verification and Stripe">
        <SubSection title="5.1 How a payment works">
          <Ul items={[
            "You enter your card or wallet in Stripe's own fields on the Storelib checkout. The details go straight to Stripe; Storelib never receives the full card number.",
            "Stripe charges the payment on Storelib's Stripe account, keeps back Storelib's fee and sends the creator's share to the creator's Stripe account.",
            "Stripe meets the card industry's security standard (PCI DSS) for the card data it holds.",
            "Some older orders were paid through Airwallex; we keep their records, and no new payments go there.",
          ]} />
        </SubSection>
        <SubSection title="5.2 Verifying creators">
          <p>
            Verification is required by law and by the card networks before a creator can be paid. Storelib&apos;s own
            payout form collects only what Stripe requires of an individual in their country, typically a date of
            birth, a home address and a phone number, together with the bank account payouts are sent to and the
            currency the creator chooses to be paid in. Storelib does not ask for a utility bill or bank statement.
            Where Stripe accepts an identity document in place of a national identification number, the document
            answers for it; only where the rules of the creator&apos;s country leave Stripe no alternative (for example a
            United States Social Security number) is the number asked for, and it is passed to Stripe without being
            stored by Storelib.
          </p>
          <p>
            Where Stripe requires an identity document, the creator presents a passport, national identity card or
            driving licence. In a web browser the check is run by Stripe Identity on Stripe&apos;s own screens: Stripe
            scans the document with the device camera and takes a photograph of the creator&apos;s face, and processes
            both with automated and biometric technology to confirm that the document is genuine and belongs to the
            person presenting it. That document image, that facial image and the biometric comparison between them are
            collected by Stripe directly and never pass through Storelib. In the Storelib app, and anywhere Stripe
            Identity is unavailable, the creator photographs the document with the camera in the app instead; Storelib
            transmits that photograph to Stripe over an encrypted connection and does not store it, and no facial image
            or biometric comparison is collected on that path.
          </p>
          <p>
            Storelib passes the details a creator types to Stripe over an encrypted connection as they are submitted
            and does not store them: no identity document, facial image, identification number, date of birth or full
            bank account number is written to Storelib&apos;s databases or logs. Stripe keeps that data as its own
            policies and the law require, and a creator can ask Stripe to delete it as{" "}
            <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className={LINK}>
              Stripe&apos;s privacy policy
            </a>{" "}
            describes.
          </p>
        </SubSection>
        <SubSection title="5.3 Disputes">
          <p>
            When a buyer disputes a payment, we record the dispute, its reason, amount and outcome, with any evidence
            the creator adds, so it can be answered and both sides have a record. Evidence is shared with Stripe and,
            through Stripe, with the card networks and the buyer&apos;s bank to decide the dispute.
          </p>
        </SubSection>
      </Section>

      <Section id="s6" title="6. Analytics, tracking and cookies">
        <SubSection title="6.1 Storelib's own analytics">
          <p>
            Creators see visits, where they came from and sales for their store. Storelib counts these itself; it does
            not use Google Analytics for this. With your consent to analytics, a returning visitor is recognised by a
            cookie so a visit is counted once. Without it, nothing is stored on your device: the pages of one visit are
            grouped by a code made from your IP address and browser for that store,
            which changes every day and cannot be turned back into either.
            Your IP address itself is not stored. Creators see totals, not who you are.
          </p>
          <p>
            Where you agree to analytics, we also use Vercel Analytics, which measures traffic and page speed without
            setting cookies.
          </p>
        </SubSection>
        <SubSection title="6.2 Creators' own tags">
          <p>
            A creator can add analytics and advertising tags to their website (listed in section 9.2), or forward their
            Storelib analytics to such a service. The creator decides this and is the controller for it. Storelib helps
            by asking for consent: Google&apos;s tags follow your answer through Google&apos;s consent mode, and Meta,
            TikTok and Pinterest&apos;s tags, and Microsoft Clarity, wait for a yes when your browser is in a European
            time zone and you have not answered yet. Outside Europe they may load until you say no. Your choice on the
            banner applies at once.
          </p>
        </SubSection>
        <SubSection title="6.3 Cookies and similar technologies">
          <div id="cookies" className="scroll-mt-28" />
          <p>
            Necessary cookies are always on. Everything else is off until you choose otherwise, and you can change your
            choice at any time with the button below or Cookie preferences at the bottom of any page. Your choice is
            kept for twelve months, then we ask again. Storelib itself sets no advertising cookies and does not sell
            data collected through cookies. The list below is every cookie and stored item Storelib&apos;s own code
            sets, on storelib.com and on the websites it hosts.
          </p>
          <CookieTable />
          <p>
            You can also block or delete cookies in your browser. If you block necessary cookies, signing in, the cart
            and checkout will not work.
          </p>
        </SubSection>
      </Section>

      <Section id="s7" title="7. Email and notifications">
        <Ul items={[
          "We send emails you need: receipts and download links, sign in codes, order, shipping, refund, dispute and payout notices, and messages about your account or plan.",
          "Creators can email their subscribers and buyers through Storelib. Every campaign has an unsubscribe link; once you use it, that creator cannot send you campaigns through Storelib. To stop all mail from a creator, ask them, or write to us.",
          `How many campaign emails a creator can send a calendar month, by plan: ${emailLimitsSentence()}.`,
          "Links in campaign emails go through Storelib so the creator can see which were clicked, and some emails may record whether they were opened. Sign in codes are sent with no tracking.",
          "Push notifications reach you only if you allowed them on your device or in your browser; turn them off there at any time.",
        ]} />
      </Section>

      <Section id="s8" title="8. Storelib AI">
        <p>
          When a creator uses Storelib AI to build or edit a website, write text or make a picture, we send what they
          type or say, and the store content needed to answer, to the AI provider running the model: Anthropic, OpenAI
          or Google, as listed in section 9.1. Website text is translated by Google Gemini, with other translators as a
          fallback. We do not send buyers&apos; or visitors&apos; personal data to AI providers on purpose; a creator who
          puts personal data in a request or on a page sends it with that content. We keep a creator&apos;s
          conversations with Storelib AI and what it remembers about their preferences in their account, and they can
          delete them.
        </p>
      </Section>

      <Section id="s9" title="9. Who we share it with">
        <p>
          We do not sell personal data, and we do not share it for cross context behavioural advertising. We share it
          only as follows.
        </p>
        <SubSection title="9.1 Service providers">
          <p>
            These companies process data for Storelib under contract, only to provide their service, except Stripe,
            which is also an independent controller for payments and verification. The list comes from the code that
            calls each one.
          </p>
          <Table
            head={["Provider", "What for", "Data", "When"]}
            rows={PROCESSORS.map((p) => [p.name, p.does, p.data, p.when === "always" ? "Always" : p.when])}
          />
        </SubSection>
        <SubSection title="9.2 Tools a creator connects">
          <p>
            A creator can connect other services to their store. When they do, Storelib sends that service what the
            integration needs, on the creator&apos;s instruction. The creator chooses them and is responsible for them,
            and each service&apos;s own privacy policy applies.
          </p>
          <div className="space-y-3">
            {tools.map((g) => (
              <p key={g.title}>
                <span className={INK}>{g.title}:</span> {g.names.join(", ")}. {g.sends}
              </p>
            ))}
          </div>
        </SubSection>
        <SubSection title="9.3 Creators">
          <p>
            When you buy from, subscribe to, book or message a creator, or join their community, the creator receives
            your name, email address, what you bought or sent, and for orders that ship, your delivery details. Team
            members the creator invites see the same.
          </p>
        </SubSection>
        <SubSection title="9.4 Public information">
          <p>
            What creators publish (their name, picture, store, products, prices and pages) is public, and appears on
            Explore and in search engines. Reviews show the reviewer&apos;s first name and the first letter of their last name. Community
            posts are visible to that community&apos;s members.
          </p>
        </SubSection>
        <SubSection title="9.5 Legal reasons and business changes">
          <p>
            We disclose data when the law requires it, to answer a valid legal request, to enforce our Terms, or to
            protect the rights, property or safety of people or Storelib. If Storelib is merged, acquired or sells its
            assets, data may move with the business; we will tell you and this policy will keep applying to it.
          </p>
        </SubSection>
      </Section>

      <Section id="s10" title="10. Data creators collect through Storelib">
        <p>
          For their buyers, subscribers, members and visitors, the creator decides why and how that data is used, and
          Storelib processes it on their behalf. Creators must have a lawful basis for what they collect, publish their
          own privacy notice, honour their customers&apos; rights and the unsubscribe requests Storelib passes on, and
          use any tracking tags lawfully. Storelib&apos;s commitments to creators as a processor, including
          confidentiality, security, the list of providers above, help with rights requests and notice of a breach,
          are set out in our data processing terms{" "}
          <Placeholder>link to Storelib&apos;s data processing agreement: to be published by Storelib</Placeholder>.
        </p>
        <p>
          If you want to use your rights over data a creator holds, ask the creator first. If you cannot reach them,
          write to <a href="mailto:privacy@storelib.com" className={LINK}>privacy@storelib.com</a> and we will pass on
          your request and help as far as our role allows.
        </p>
      </Section>

      <Section id="s11" title="11. International transfers">
        <p>
          Storelib and its providers process data in the United States, the European Union and other countries. When
          data from the EEA, the UK or Switzerland goes to a country without an adequacy decision, we rely on the
          European Commission&apos;s Standard Contractual Clauses, with the UK addendum and the Swiss amendments, or
          another lawful mechanism such as a provider&apos;s certification under the EU-US Data Privacy Framework. You can
          ask for a copy of the safeguards at privacy@storelib.com.
        </p>
      </Section>

      <Section id="s12" title="12. How long we keep it">
        <Table
          head={["Data", "Kept"]}
          rows={[
            ["Account", "While the account is open. When you delete it, your personal details are erased at once; an account that never sold, paid out or was billed is removed completely."],
            ["Orders, refunds, payouts, invoices and balance history", "Kept after an account is deleted, as financial records, for at least 7 years or as long as tax and accounting law requires."],
            ["Buyers' purchases", "As long as the buyer has access to what they bought, so they keep their library, then as financial records as above."],
            ["Analytics", "Visits are kept as counts for the creator's reports. Visits counted without consent use a code that changes every day; your IP address is not stored."],
            ["Subscribers", "Until the subscriber unsubscribes or the creator removes them. We keep the unsubscribe itself so they are not emailed again."],
            ["Storelib AI build logs", "30 days."],
            ["Pictures sent in community chats", "30 days."],
            ["Support requests", <Placeholder key="support">retention period: to be confirmed by Storelib</Placeholder>],
            ["Backups", <Placeholder key="backups">backup retention period: to be confirmed by Storelib and its hosting provider</Placeholder>],
          ]}
        />
        <p>We may keep data longer where the law requires it, or to deal with a dispute or a legal claim.</p>
      </Section>

      <Section id="s13" title="13. Security">
        <Ul items={[
          "Everything between your device and Storelib is encrypted with TLS.",
          "Database rows are protected by access rules, so one account cannot read another's private data; secrets such as API keys are readable only by our servers.",
          "Card details are handled by Stripe and never reach our servers.",
          "Uploaded files are checked for malware, and purchased files are delivered through signed links that expire.",
          "Sign in sessions are kept in cookies under names another website cannot set.",
          "Only staff who need it can reach personal data.",
        ]} />
        <p>
          No system is completely secure. If a breach puts your personal data at risk, we will tell you and the
          authorities as the law requires, and we will tell creators about a breach affecting their customers&apos;
          data without undue delay.
        </p>
      </Section>

      <Section id="s14" title="14. Your rights">
        <SubSection title="14.1 Everyone">
          <p>
            You can see and change most of your data in Settings, export your orders and subscribers as CSV files, and
            delete your account in Settings, Security. For anything else, write to{" "}
            <a href="mailto:privacy@storelib.com" className={LINK}>privacy@storelib.com</a>. We may need to check it is
            you, and we reply within a month (45 days for US state requests), or tell you if we need longer. We do not
            charge for a request unless it is clearly unfounded or excessive.
          </p>
        </SubSection>
        <SubSection title="14.2 EEA, UK and Switzerland">
          <p>
            You have the right to access your data, to correct it, to have it erased, to restrict or object to our use
            of it, to receive it in a portable format, and to withdraw consent. You can complain to the data protection
            authority where you live or work, though we would like the chance to help first.
          </p>
        </SubSection>
        <SubSection title="14.3 Elsewhere">
          <p>
            Many other places, including Brazil, Canada and several US states, give similar rights. We honour them as
            the law where you live requires.
          </p>
        </SubSection>
      </Section>

      <Section id="s15" title="15. US state privacy notice">
        <p>
          This section is for residents of California and other US states with comprehensive privacy laws. In the last
          twelve months we collected these categories of personal information: identifiers (name, email, IP address,
          account ids), commercial information (purchases and orders), financial information handled by Stripe, internet
          activity (pages viewed and where visits came from), approximate location (country and region), audio and
          visual information (photos, and spoken requests to Storelib AI), and professional information about
          creators&apos; stores. Creators&apos; identity documents and biometric checks are collected by Stripe, not by
          Storelib. We use them for the purposes in section 4, share them with the recipients in section 9, and keep
          them as in section 12.
        </p>
        <p>
          Storelib does not sell personal information or share it for cross context behavioural advertising, and does
          not use sensitive personal information to infer characteristics about you. A creator&apos;s own advertising
          tags on their website are the creator&apos;s responsibility. You have the right to know, delete and correct,
          and not to be discriminated against for using these rights; you may use an authorised agent. Send requests to
          privacy@storelib.com. If we refuse a request you can appeal by replying to our answer.
        </p>
      </Section>

      <Section id="s16" title="16. Children">
        <p>
          Storelib is not meant for children. You must be 18 or older to have an account, and we do not knowingly
          collect personal data from children under 16 (under 13 in the United States). If you believe a child has
          given us personal data, write to privacy@storelib.com and we will delete it.
        </p>
      </Section>

      <Section id="s17" title="17. The Storelib apps">
        <Ul items={[
          "The app for iPhone and iPad shows storelib.com in the app, so this policy applies there too. Apple collects its own data under its privacy policy.",
          "The app asks for the camera and your photos only when you take or choose a picture (a product photo, a profile picture, an identity document for Stripe), and for notifications only if you want them.",
          "The apps set no advertising identifier and do not track you across other companies' apps or websites.",
        ]} />
      </Section>

      <Section id="s18" title="18. Changes to this policy">
        <p>
          We will update this policy when what we do changes. The dates at the top say when it took effect and when it
          last changed. If a change matters, we will tell you by email or in Storelib before it applies.
        </p>
      </Section>

      <Section id="s19" title="19. Contact">
        <div className="mt-3 space-y-1 rounded-2xl bg-[var(--legal-panel,#f8f9fa)] p-4 text-[14px]">
          <p>
            <span className="font-medium text-[var(--legal-ink,#1a1a2e)]">Privacy:</span>{" "}
            <a href="mailto:privacy@storelib.com" className={LINK}>privacy@storelib.com</a>
          </p>
          <p>
            <span className="font-medium text-[var(--legal-ink,#1a1a2e)]">Support:</span>{" "}
            <a href="mailto:support@storelib.com" className={LINK}>support@storelib.com</a>
          </p>
          <p>
            <span className="font-medium text-[var(--legal-ink,#1a1a2e)]">Post:</span> Storelib Inc.,{" "}
            <Placeholder>registered address: to be confirmed by Storelib</Placeholder>
          </p>
        </div>
      </Section>
    </>
  )
}
