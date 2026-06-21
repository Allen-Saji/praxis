# Praxis Dashboard - Design Brief

Status: BUILT, then reskinned. Sections 1-14 describe the original "instrument,
not brochure" build. Section 15 (Premium Atmosphere Redesign) is the current
direction and SUPERSEDES the no-gradient / no-WebGL anti-patterns in sections 7
and 13 where they conflict. The data semantics (risk colors, mono-for-truth,
density, real-data-or-empty) are unchanged; only the surface treatment moved from
flat-dark to a cinematic command deck. All copy is plain ASCII.

---

## 1. Product Summary

Praxis is a wallet-agnostic security, simulation, and audit layer for AI agent
spending on Sui. It sits between an AI agent and its wallet. Before every spend it
dry-runs the transaction, risk-scores the result, hands a report back to the agent
to self-correct, and writes the full reasoning to Walrus with a tamper-evident
on-chain receipt. Two surfaces share one codebase: a developer-facing landing
site (`/`, `/docs`) that explains the three-party model and ships a real SDK
snippet, and an instrument-panel dashboard (`/app/*`) where developers and
compliance officers watch agent spend, read simulation reports, and decrypt sealed
reasoning. The dashboard must feel dense, fast, and trustworthy. It is closer to
Datadog or a block explorer than to a marketing page. The headline metric is
"drains prevented" (the aborted-spend counter). A high abort rate is good: it
means the agent was protected.

Audience: the dashboard serves two readers. A developer integrating `@praxis/sdk`
who wants to confirm the gate is firing, and a compliance officer who needs an
audit trail they can defend (the EU AI Act Article 12 logging anchor for this
project). Design for the compliance reader's trust and the developer's speed at
once: no decoration that a regulator would read as marketing fluff, no friction a
developer would resent.

---

## 2. Moodboard (references actually reviewed)

Eight references, grouped by what we take and what we leave.

### Observability and security dashboards

1. **Linear** - https://linear.app/now/how-we-redesigned-the-linear-ui
   - Steal: the grey-heavy palette discipline. Most text and icons live at 40-60%
     opacity; only status indicators, priority markers, and interactive elements
     get full-saturation color. This is exactly the rule Praxis needs so Sui blue
     and the four risk colors stay loud against a quiet field. Also: progressive
     disclosure on row hover (extra actions appear only when you point at a row),
     and a Cmd+K command palette as the real navigation.
   - Avoid: Linear's product-management chrome and its softness. Praxis is a
     security tool, not a planning tool; it should read sharper and more literal.

2. **Sentry - new issue details UI** - https://sentry.io/changelog/new-issue-details-ui-now-available/
   - Steal: severity as a first-class, color-coded level shown right under the
     title (Sentry uses Error=orange, Warning=yellow, Fatal=red, Info=blue). Maps
     one-to-one to Praxis risk levels. Also: collapsible sections and detail
     drawers for progressive disclosure so a long event never front-loads
     everything. Workflow actions are grouped apart from read-only detail.
   - Avoid: stack-trace density that does not apply here. Our "event" is a spend,
     not a crash; keep the detail page about money and reasoning, not frames.

3. **Datadog dashboards (dark mode)** - https://www.datadoghq.com/blog/introducing-datadog-darkmode/
   - Steal: dark mode built for long staring sessions (light text on dark, no pure
     white text on pure black), and the stat-header-over-stream layout where a
     row of summary tiles sits above the detailed time series.
   - Avoid: 12-column drag-resize widget builder. Praxis ships opinionated fixed
     layouts, not a configurable canvas. Over-configurability would dilute the
     instrument-panel feel.

4. **Honeycomb / the Signal SRE aesthetic** - https://medium.com/@jjhayes100/the-art-of-observability-4e3fe1c2ab04
   - Steal: terminal-grade data formatting. Monospace numerics, near-black field,
     a single restrained accent for semantics. Tables built to scan thousands of
     rows without eye fatigue.
   - Avoid: query-builder complexity. Our reads are pre-shaped (recent receipts,
     per-agent, one spend), so we do not need a free-form query UI in v1.

### Blockchain explorers

5. **Suiscan testnet** - https://suiscan.xyz/testnet/
   - Steal: the canonical key/value detail layout for a transaction (status, gas,
     timestamp, events tab), and address/digest truncation conventions. This is
     the explorer Praxis deep-links to, so receipt and tx links should feel like a
     natural handoff to it. Verified link format: `suiscan.xyz/testnet/tx/[digest]`.
   - Avoid: explorer breadth. We render only the slice that matters for a spend;
     we do not rebuild a general explorer.

6. **SuiVision testnet** - https://testnet.suivision.xyz/
   - Steal: a cleaner, card-based take on the same object/tx data. Use as the
     fallback explorer link target and as a second opinion on how Sui objects are
     labeled.
   - Avoid: same as above.

### Dense-table and dev-tool craft

7. **Setproduct data-table guide** - https://www.setproduct.com/blog/data-table-ui-design
   - Steal: concrete numbers we adopt directly. 16px horizontal / 8px vertical
     cell padding, 1px row separators (let whitespace carry structure, not a full
     grid of borders), right-align all numeric and monospace columns so digits
     line up by place value, sticky header once the table scrolls past one screen,
     virtualize past ~1,000 rows, never paginate without showing a total count,
     status strings rendered as scannable color-coded badge tokens in-cell.
   - Avoid: density-mode switcher and frozen columns in v1; our tables fit without
     horizontal scroll on desktop, so we skip the complexity.

8. **Evil Martians - 100 dev tool landing pages, 2025** - https://evilmartians.com/chronicles/we-studied-100-devtool-landing-pages-here-is-what-actually-works-in-2025
   - Steal (for `/` and `/docs`): centered max-width hero, short bold headline plus
     one-line subhead plus two CTAs (primary "Read the quickstart", secondary
     "View on Suiscan"). Code snippet is the hero visual for an SDK product.
     Problem-first feature storytelling beats a function list. Eyebrow/banner for
     status ("testnet live"). Curated single testimonial is fine at this stage.
   - Avoid: "no salesy BS", no flashy interactions, no abstract purple-gradient
     hero. Clean typography and white space win for a developer audience.

---

## 3. Design Principles

1. **Instrument, not brochure.** Every pixel on `/app` should answer a question a
   developer or auditor is actually asking. Density is a feature. Decoration that
   does not encode data gets cut.
2. **Color is signal, not paint.** Borrowed from Linear: the field is grey on near
   black. Saturated color (Sui blue, the four risk levels) appears only where it
   carries meaning. If everything is colored, nothing reads as a warning.
3. **Aborts are the hero.** "Drains prevented" is the top-line number. The UI
   frames a blocked spend as a win, with the same visual weight a normal product
   would give a success. Abort detail is as rich as confirm detail, because the
   abort is the audit artifact.
4. **Monospace for truth.** Anything that is a verbatim on-chain or cryptographic
   value (address, digest, blob id, amount, blake3 hash, risk score) renders in
   mono. Anything that is a human label renders in the UI face. The reader can
   tell machine fact from human framing at a glance.
5. **Real data or empty.** No placeholder rows, no fake agents, no lorem amounts,
   not even in screenshots. Every view either shows live testnet data or a
   purposeful empty state that explains how to produce the first row.
6. **Progressive disclosure.** Summary first, drill on demand. Row hover reveals
   actions; a spend opens to full reasoning; a sealed blob stays sealed until an
   allowlisted viewer decrypts it.
7. **Accessible by construction.** Color is never the only signal (risk level
   always pairs an icon or label with the hue). All interactive elements have
   hover, focus-visible, active, and disabled states. Respect
   `prefers-reduced-motion`.

---

## 4. Type Scale

### Fonts

- **UI face: Geist** (Vercel's grotesque, variable). Chosen over the starting-point
  Inter on purpose. Inter is banned as a primary face in our design guidelines for
  being the generic default, and Geist is purpose-built for dense product and
  observability UI while staying neutral enough for a compliance tool. It carries
  more character at large sizes (landing headlines) without ever looking
  decorative in a table. Load via `geist` package or Google Fonts equivalent.
- **Mono face: JetBrains Mono** (variable). Kept from the starting point and
  validated by the SRE/observability reference: it is the de facto terminal face
  for this product class, with a tall x-height and unambiguous `0/O`, `1/l/I`,
  which matters when the reader is comparing Sui addresses by eye. Used for every
  verbatim machine value, code blocks, and table numerics.

Two families only. Geist for everything human, JetBrains Mono for everything the
chain or the SDK produced.

### Scale (UI face, Geist)

| Token        | Size / line-height | Weight | Use |
|--------------|--------------------|--------|-----|
| display      | 48 / 52 (3rem)     | 600    | landing hero headline only |
| h1           | 30 / 36            | 600    | page title (`/app`, agent profile) |
| h2           | 22 / 28            | 600    | section headers, drawer titles |
| h3           | 17 / 24            | 600    | card titles, stat labels (uppercase tracked) |
| body         | 15 / 22            | 400    | default reading text |
| body-sm      | 13 / 20            | 400    | secondary copy, table labels |
| label        | 12 / 16            | 500    | stat-card captions, badges, eyebrows (tracking +0.04em, uppercase) |

### Scale (mono, JetBrains Mono)

| Token        | Size / line-height | Weight | Use |
|--------------|--------------------|--------|-----|
| data         | 14 / 20            | 400    | addresses, digests, amounts in tables |
| data-sm      | 12 / 18            | 400    | inline truncated ids, meta |
| data-lg      | 18 / 24            | 500    | the big stat numbers ("142 drains prevented") |
| code         | 13 / 22            | 400    | code blocks on `/` and `/docs` |

Body text floor is 15px on desktop, never below 16px effective on mobile. Reading
measure for any prose block is capped at 65-75ch.

Google Fonts import (if not using the npm packages):
```css
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap');
/* Geist via the geist npm package (next/font) is preferred over a CDN import. */
```

---

## 5. Color Tokens

Dark mode is the default and only theme for v1 (a light theme is out of scope; the
product is a night-shift instrument panel). All values verified for WCAG contrast
against the dark field. Contrast ratios listed are real, computed against the
stated background, not asserted.

### Neutrals (the quiet field)

| Token            | Hex       | OKLCH (approx)            | Use | Contrast note |
|------------------|-----------|---------------------------|-----|---------------|
| `--bg`           | `#0A0B0D` | oklch(0.16 0.004 250)     | app canvas, near black, faintly cool | base for all text |
| `--panel`        | `#121316` | oklch(0.20 0.004 250)     | cards, drawers, raised surfaces | |
| `--panel-2`      | `#16181C` | oklch(0.23 0.004 250)     | table row hover, nested panels | |
| `--border`       | `#23262B` | oklch(0.28 0.004 250)     | 1px hairlines, table separators | low-emphasis, structural only |
| `--border-hi`    | `#33373D` | oklch(0.34 0.004 250)     | focused/active borders | |
| `--text-hi`      | `#E6E8EB` | oklch(0.92 0.003 250)     | primary text, headings | 16.0:1 on bg |
| `--text-mid`     | `#9BA1A8` | oklch(0.70 0.006 250)     | labels, secondary text | 7.6:1 on bg (AA all sizes) |
| `--text-low`     | `#6B7177` | oklch(0.54 0.006 250)     | muted meta, timestamps | 4.0:1 on bg (large text only; never for essential small text) |

### Accent (Sui blue, used sparingly)

| Token            | Hex       | Use | Contrast note |
|------------------|-----------|-----|---------------|
| `--accent`       | `#00D2FF` | brand accent, primary CTA, active nav, links | 10.9:1 on bg (AAA) |
| `--accent-quiet` | `#3DC8F0` | accent for large fills/hover where raw is too hot | 10.0:1 on bg |
| `--accent-tint`  | `#00D2FF` at 12% alpha | active-row tint, selected-tab background, focus ring glow | decorative tint only |

Raw Sui blue `#00D2FF` passes AAA on the dark field, so we keep it true to brand
for text and icons. Reserve it for: the active nav item, the primary CTA, link
text, the live counter underline, focus rings. Do not use it as a generic panel
or chart color, or it stops meaning "this is the brand / this is active".

### Risk levels (the four semantic colors)

These are the most important colors in the product. Each pairs a hue with a
required icon and label so color is never the sole signal.

| Level      | Token           | Hex       | Icon (Lucide) | As text/icon on bg | Filled-badge rule |
|------------|-----------------|-----------|---------------|--------------------|-------------------|
| low        | `--risk-low`    | `#4ADE80` | `shield-check` | 11.3:1 (AAA) | tinted chip preferred |
| medium     | `--risk-medium` | `#FBBF24` | `alert-triangle` | 11.8:1 (AAA) | tinted chip preferred |
| high       | `--risk-high`   | `#FB923C` | `flame` | 8.7:1 (AAA) | tinted chip preferred |
| critical   | `--risk-critical`| `#F4516C`| `octagon-alert` | 5.9:1 (AA) | use `--bg` (near-black) text on solid fill, not white |

Accessibility notes that matter for implementation:
- All four pass AA as colored text or icons on `--bg` and `--panel`. low/medium/high
  also clear AAA; critical clears AA (5.9:1).
- The default badge style is a **tinted chip**: the risk color at ~14% alpha as the
  chip background, the full risk color as the text, plus the icon. This keeps the
  badge legible and keeps the field quiet.
- If a **solid filled** badge is ever needed (for example a single critical alert
  banner), the text on the fill must be `--bg` (near-black), not white. White on
  `--risk-critical` is only 3.4:1 and fails; near-black is 5.9:1 and passes. Same
  rule for solid green/amber/orange fills: near-black text, never white.

### Outcome / status colors (reuse risk hues with intent)

| Status      | Color source        | Use |
|-------------|---------------------|-----|
| confirmed   | `--text-mid` + `check` icon | a normal completed spend is neutral, not celebrated |
| aborted     | `--risk-critical` family + `shield` icon | the hero outcome; framed as protection, not failure |
| sim passed  | `--risk-low` | simulation succeeded |
| sim failed  | `--risk-critical` | simulation reverted |
| sealed      | `--accent` + `lock` icon | reasoning is Seal-encrypted |
| public      | `--text-low` + `lock-open` icon | reasoning is readable |

Note on framing: an aborted spend uses the critical-red family because it is a
hard stop, but the surrounding copy and the stat header treat it as a win
("drain prevented"). Red here means "we stopped something", not "we failed".

---

## 6. Spacing, Radius, Elevation

- **Base unit: 4px.** Scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- **Section rhythm:** 24px between cards in a grid, 32px between major page
  sections, 16px internal card padding (20px on the spend-detail drawer).
- **Table density:** 16px horizontal cell padding, 8px vertical, 1px `--border`
  row separators. Row height 44px (clears the 44px touch-target floor while
  staying compact). Header row 40px, sticky, `--panel` background.
- **Radius:** `--r-sm` 6px (badges, inputs, buttons), `--r-md` 10px (cards,
  panels), `--r-lg` 14px (drawers, modals). No fully rounded pills except the
  small status dot.
- **Elevation:** dark UI uses border + subtle background-step for depth, not heavy
  shadows. Cards are `--panel` on `--bg` with a 1px `--border`. Drawers and the
  command palette get one soft shadow: `0 16px 48px rgba(0,0,0,0.5)` plus a 1px
  `--border-hi`. Avoid glow except a faint `--accent` focus ring.
- **Max widths:** `/app` content max 1440px (dashboard convention), landing and
  docs prose max 1080px, prose measure capped at 72ch.
- **Breakpoints:** 375 (mobile), 768 (tablet), 1024 (laptop), 1440 (desktop).
  Tables collapse to stacked key/value cards below 768.

---

## 7. Animation

Strategic motion only. The instrument panel should feel instant, not animated.

- **Durations:** 150-200ms for micro-interactions (hover, focus, badge tint),
  250-300ms for drawer/panel slide-in, 400ms cap for the landing hero reveal.
- **Easing:** `cubic-bezier(0.2, 0, 0, 1)` (decelerate) for entrances; linear for
  the live counter tick.
- **What animates:** row hover background (150ms), drawer slide from right (280ms),
  the live "drains prevented" counter (count-up on mount, then tick on new event),
  new-row insertion in the live stream (fade + 8px slide, 200ms, one row at a
  time, never a cascade), decrypt action (lock icon morph + 1 line reveal).
- **What never animates:** table sorting, page navigation content, any number that
  represents money mid-read, anything blocking interaction.
- **Reduced motion:** when `prefers-reduced-motion: reduce`, drop all slide/fade,
  keep instant state changes, counter shows final value with no count-up.
- Transforms and opacity only. Never animate layout properties.

Reference components to vendor rather than build from scratch (both copy-paste,
TS + Tailwind variants):
- React Bits `Count Up` (TS-TW) for the live "drains prevented" counter.
- ScrollX UI `Timeline` for the abort timeline on the agent profile.
- ScrollX UI `CodeBlock` as the base for the SDK snippet, restyled to our tokens.
Everything else is shadcn/ui restyled to the token set. Do not stack WebGL
backgrounds; this is a data tool, not a showcase.

---

## 8. Component Inventory

Atoms, then molecules, then organisms. Each maps to a file in section 10.

### Atoms

- **`RiskBadge`** - props: `level` (low|medium|high|critical). Renders tinted chip
  + Lucide icon + label. The single source of truth for risk color. Used in
  tables, detail headers, and the risk list.
- **`RiskScore`** - props: `score` (0-100). Mono number plus a 4px segmented bar
  colored by the band it falls in (0-29 low, 30-59 medium, 60-79 high, 80-100
  critical, matching the SDK thresholds: review at 30, block at 80).
- **`StatusBadge`** - props: `status` (confirmed|aborted|sim_passed|sim_failed).
  Icon + label, neutral for confirmed, critical family for aborted.
- **`SealBadge`** - props: `sealed` (bool). Lock / lock-open icon + "Sealed" /
  "Public".
- **`Address`** - props: `value`, `kind` (account|object|tx|coin), `copy?`. Mono,
  truncated middle (`0x42780ec3...69d7`), click to copy, optional external link to
  Suiscan in the correct route for its kind.
- **`Amount`** - props: `mist` (string|bigint), `coinType`. Formats MIST to SUI
  with fixed decimals, right-aligned mono, coin symbol suffix. (V1 is SUI-only per
  the SDK guard.)
- **`Timestamp`** - props: `ms`. Relative ("2m ago") with absolute on hover/title.
- **`BlobLink`** - props: `blobId`. Mono truncated; links to the Walrus aggregator
  blob URL, or shows a "local fallback" tag when the id starts with `local:`.
- **`CopyButton`**, **`Button`** (primary/secondary/ghost/danger via CVA),
  **`Spinner`**, **`Tooltip`**, **`Kbd`** (for the command-palette hint).

### Molecules

- **`StatCard`** - label + big mono number + optional delta + optional sparkline
  slot. The drains-prevented card is a featured variant (larger, accent underline).
- **`KeyValueRow`** - the explorer-style label/value line used throughout detail
  views (label in `--text-mid`, value in mono or `--text-hi`).
- **`CodeBlock`** - syntax-highlighted, copy button, optional SDK/language tabs.
  Built on ScrollX `CodeBlock`, restyled.
- **`EmptyState`** - icon + headline + one-line explanation + a copyable SDK
  snippet that produces the first row. One per data view, copy written in §11.
- **`DecryptControl`** - the "Decrypt with Seal" action. States: sealed-locked
  (shows allowlist count), decrypting (spinner), revealed (renders plaintext
  reasoning), denied (viewer not on allowlist, shows the specific error). See §9
  for data flow.
- **`RiskFlagList`** - renders `SimulationReport.risks[]` and `policyViolations[]`
  as a list of RiskBadge + code + message rows.
- **`BalanceChangeRow`** - owner Address + coin + signed Amount (red for outflow,
  green for inflow), for `SimulationReport.balanceChanges[]`.

### Organisms

- **`DataTable`** - the workhorse. Generic, virtualized past ~1k rows, sticky
  header, sortable columns with a single active-direction arrow, right-aligned
  numeric/mono columns, 44px rows, 1px separators, row hover reveals a chevron and
  (on the stream) a "view" affordance, click opens the spend drawer or routes to
  detail. Total count always shown. Mobile: collapses to stacked KeyValue cards.
- **`LiveSpendStream`** - DataTable bound to a live receipt feed (see §9). New rows
  fade-slide in one at a time. A small "live" dot pulses while polling is active;
  a pause control freezes the feed for reading.
- **`StatHeader`** - the row of StatCards above the stream (total spends, abort
  rate, risk distribution, drains prevented featured).
- **`RiskDistribution`** - a compact stacked horizontal bar of low/medium/high/
  critical counts, with a legend. The only chart in v1.
- **`SpendDrawer`** - right-side drawer (or `/app/spend/[id]` page at full width)
  holding the full spend: intent, reasoning chain, simulation report, risk flags,
  on-chain receipt links, decrypt control.
- **`AgentCard`** - per-agent summary card on the dashboard home: agent address,
  spend count, abort count, abort rate, last activity, risk mix mini-bar, links to
  the agent profile.
- **`AppShell`** - left rail nav (Dashboard, Agents, Docs) + top bar (network
  badge "testnet", connected viewer address, Cmd+K hint) + content slot.
- **`CommandPalette`** - Cmd+K. Jump to agent by address, open a spend by id,
  toggle the live stream, go to docs. (Borrowed from the Linear reference.)
- **`NetworkBadge`** - shows "testnet" with the live `packageId` short form on
  hover; turns to a warning style if the configured deployment is missing.

---

## 9. Real-Data Sources (per view)

Hard constraint: no mock data anywhere. Every view binds to live testnet data via
`@praxis/sdk`, Sui RPC, or the Walrus aggregator. The exact wiring, read straight
from the SDK and the Move package already deployed at
`packageId 0xb9e95d52...e32d`, `agentIndexId 0x42780ec3...69d7` (testnet):

| View / element | Source | Mechanism |
|----------------|--------|-----------|
| "Drains prevented" counter | `AgentIndex.total_aborts` | `suiClient.getObject(agentIndexId)` then read the `total_aborts` field. Also exposed via the `record_abort` event count. |
| "Total spends" | `AgentIndex.total_count` | same `getObject` read. |
| "Abort rate" | derived | `total_aborts / (total_aborts + total_count)`. |
| Live spend stream | `SpendingReceiptCreated` events | `praxis.audit.recent(limit)` -> `queryEvents({ MoveEventType: \`${packageId}::spending_receipt::SpendingReceiptCreated\`, order: "descending" })`. Each event is a `ReceiptEvent`. Poll on an interval for "live"; later swap to a subscription if available. |
| Per-agent cards / list | distinct agents from receipts | derive the agent set from `audit.recent`, or `agent_registry::agent_receipt_count(index, agent)` for an exact per-agent count. |
| Agent profile spend history | `audit.byAgent(agent)` | filters `SpendingReceiptCreated` events by `agent`. |
| Agent abort timeline | `AbortRecorded` events | `queryEvents({ MoveEventType: \`${packageId}::agent_registry::AbortRecorded\` })`, filter by `agent`. Fields: `walrus_blob_id`, `reason_code` (0 agent_decision, 1 policy_block, 2 high_risk, 3 sim_failed), `risk_score`, `timestamp_ms`. |
| Spend detail header | the `ReceiptEvent` for that receipt | from the stream/profile query, or `getObject(receiptId)` for the full `SpendingReceipt` (adds `coin_type`, `seal_policy_id`, `purpose_tag`, `sdk_version`). |
| Reasoning chain (prompt/decision/model) | Walrus blob | decode `walrus_blob_id` (bytes -> utf8 string), fetch from the aggregator `https://aggregator.walrus-testnet.walrus.space/v1/blobs/{blobId}`, parse `ReasoningBlob` v2. `local:`-prefixed ids read from the local fallback (dev only). |
| Simulation report | same Walrus blob | `ReasoningBlob.simulation` (success, balance_changes, gas_estimate, risk_score, risks, recommendation) plus `policy_check`. |
| Risk flags / policy violations | same blob | `simulation.risks[]` and `policy_check.violations[]`. Codes: DRAIN_DETECTED, BLOCKED_RECIPIENT, UNKNOWN_RECIPIENT, OVER_TX_LIMIT, OVER_DAILY_LIMIT, SIM_FAILED, HIGH_GAS, SIM_REQUIRED. |
| On-chain receipt link | the receipt id / tx digest | Suiscan: object at `suiscan.xyz/testnet/object/{receiptId}`, tx at `suiscan.xyz/testnet/tx/{digest}` (tx format verified). Account at `.../account/{addr}`, coin at `.../coin/{type}`. SuiVision `testnet.suivision.xyz` as fallback. |
| Decrypt with Seal | `praxis.audit.reveal(blobId, viewer)` | fetches the sealed blob from Walrus, checks the viewer against the auditor allowlist, AES-256-GCM decrypts (LocalSealer today, drop-in real Seal later), returns the plaintext `ReasoningBlob`. Denied if viewer not on `auditors[]`. The dashboard's connected address is the `viewer`. |
| Network badge | `DEPLOYMENTS.testnet` | from SDK config; warns if `packageId` is `0x0`. |

Data access pattern for the web app: do not put a private key in the browser. The
dashboard is read-and-decrypt only, so it uses a read-only `SuiJsonRpcClient`
(public testnet fullnode), direct Walrus aggregator fetches, and `audit.reveal`
gated by the connected viewer address. The signing paths (`spend`, `record_abort`)
live only in the SDK on the agent side, never in the dashboard.

Caching: use SWR for the receipt/event reads (dedup, revalidate on focus). The two
`AgentIndex` counters can revalidate on a short interval to drive the live counter.
Walrus blobs are immutable, so cache them indefinitely by `blobId`.

---

## 10. File and Component Structure (Next.js App Router)

```
apps/web/
  app/
    layout.tsx                  # fonts (Geist + JetBrains Mono via next/font), <body> tokens
    globals.css                 # @theme tokens (see token note below), base styles
    page.tsx                    # / landing
    docs/
      page.tsx                  # /docs SDK quickstart
    app/
      layout.tsx                # AppShell (nav rail + top bar + CommandPalette)
      page.tsx                  # /app dashboard home (StatHeader + AgentCards + LiveSpendStream)
      agents/
        [addr]/page.tsx         # agent profile (history table + reports + abort timeline)
      spend/
        [id]/page.tsx           # spend detail (full page variant of SpendDrawer)
  components/
    primitives/                 # shadcn/ui restyled to tokens (button, drawer, dialog, tooltip, tabs)
    data/
      RiskBadge.tsx
      RiskScore.tsx
      StatusBadge.tsx
      SealBadge.tsx
      Address.tsx
      Amount.tsx
      Timestamp.tsx
      BlobLink.tsx
    blocks/
      StatCard.tsx
      StatHeader.tsx
      RiskDistribution.tsx
      KeyValueRow.tsx
      CodeBlock.tsx
      EmptyState.tsx
      DecryptControl.tsx
      RiskFlagList.tsx
      BalanceChangeRow.tsx
      DataTable.tsx
      LiveSpendStream.tsx
      AgentCard.tsx
      SpendDrawer.tsx
    shell/
      AppShell.tsx
      NavRail.tsx
      TopBar.tsx
      NetworkBadge.tsx
      CommandPalette.tsx
    marketing/
      Hero.tsx
      ThreePartyDiagram.tsx     # agent / praxis / wallet, SVG
      LiveCounter.tsx           # drains-prevented count-up
      FeatureRow.tsx
      SiteNav.tsx
      SiteFooter.tsx
  lib/
    praxis.ts                   # read-only Praxis/SuiJsonRpcClient + audit helpers
    walrus.ts                   # aggregator fetch + ReasoningBlob parse + local fallback
    format.ts                   # mist->SUI, address truncation, blob-bytes->string
    explorer.ts                 # suiscan/suivision link builders by kind
    hooks/
      useReceipts.ts            # SWR: audit.recent / byAgent
      useIndexStats.ts          # SWR: AgentIndex counters
      useReasoningBlob.ts       # SWR: blob fetch + parse
      useDecrypt.ts             # audit.reveal flow + state machine
    risk.ts                     # score->band mapping, reason_code->label
  vendor/                       # copy-paste React Bits / ScrollX components, retokenized
```

Component architecture rules (from our composition guidelines): prefer compound
components and explicit variants over boolean-prop soup. `DataTable` takes column
definitions and a row renderer, not a dozen `showX` flags. `DecryptControl` is a
small state machine (sealed | decrypting | revealed | denied), not a pile of
booleans. CVA for `Button` and `RiskBadge` variants. `cn()` for conditional
classes.

Token note: per the Tailwind v4 gotcha, declare design tokens in `@theme` (as
`--color-*`) so utilities generate, AND mirror short aliases in a `:root` block so
inline `var(--risk-critical)` etc. resolve. A plain `:root` token block alone gets
stripped at compile time.

---

## 11. Page Specs (ASCII wireframes)

### `/` Landing

Purpose: explain what Praxis is, show the three-party model, ship a real SDK
snippet, show the live drains-prevented counter, send the reader into the
dashboard or the docs. Centered, max 1080px, dark, code snippet is the hero visual.

```
+----------------------------------------------------------------------+
|  PRAXIS                              Docs    Dashboard   [GitHub]     |  SiteNav
+----------------------------------------------------------------------+
|                                                                      |
|              [eyebrow]  TESTNET LIVE                                  |
|                                                                      |
|         A safety layer between your AI agent and its wallet.         |  display
|         Praxis simulates and risk-scores every spend before          |  body
|         it signs, and writes the reasoning to an audit trail.        |
|                                                                      |
|        [ Read the quickstart ]   [ Open the dashboard ]              |  primary / secondary
|                                                                      |
|   +--------------------------------------------------------------+   |
|   |  $ const result = await praxis.spend({                       |   |  CodeBlock
|   |      to: recipient,                                          |   |  (real SDK call,
|   |      amount: 5_000_000_000n,                                 |   |   copy button)
|   |      reasoning: { prompt, decision, model },                 |   |
|   |      onReport: (r) => r.recommendation === "proceed",        |   |
|   |    });                                                       |   |
|   |  // -> { status: "aborted", abortReason: "high_risk", ... }  |   |
|   +--------------------------------------------------------------+   |
|                                                                      |
+----------------------------------------------------------------------+
|   The three-party model                                              |
|                                                                      |
|   +----------+        +-----------------+        +----------+        |  ThreePartyDiagram
|   |  AGENT   | -----> |     PRAXIS      | -----> |  WALLET  |        |  (SVG)
|   | decides  |        | simulate /      |        |  signs   |        |
|   |          | <----- | risk-score /    |        |          |        |
|   |          | report | gate            |        |          |        |
|   +----------+        +--------+--------+        +----------+        |
|                                |                                     |
|                       Walrus audit trail + on-chain receipt         |
+----------------------------------------------------------------------+
|                                                                      |
|            142   drains prevented on testnet                         |  LiveCounter
|            (live from AgentIndex.total_aborts)                       |  (mono data-lg, accent underline)
|                                                                      |
+----------------------------------------------------------------------+
|   Problem-first feature rows (3): simulate before signing /          |  FeatureRow x3
|   risk-score and gate / verifiable audit trail                       |
+----------------------------------------------------------------------+
|   Footer: links, testnet package id, GitHub                          |  SiteFooter
+----------------------------------------------------------------------+
```

### `/app` Dashboard home

Purpose: at-a-glance health, per-agent overview, live spend stream.

```
+------+---------------------------------------------------------------+
| NAV  | testnet *  0x6b...g5  (you)              Cmd+K to jump        |  TopBar
| ---- +---------------------------------------------------------------+
| Dash |  +-------------+ +-------------+ +-------------+ +----------+  |
| Agnt |  | TOTAL SPENDS| | ABORT RATE  | | RISK DIST   | | DRAINS   |  |  StatHeader
| Docs |  |   1,204     | |   38%       | | [==||==||=]  | |PREVENTED |  |  (drains = featured card,
|      |  | mono data-lg| | mono        | | low/med/hi/cr| |   458    |  |   accent underline)
|      |  +-------------+ +-------------+ +-------------+ +----------+  |
|      |                                                               |
|      |  Agents                                                       |
|      |  +-----------------+ +-----------------+ +-----------------+  |
|      |  | 0x42..d7        | | 0x9a..1c        | | 0xff..3e        |  |  AgentCard grid
|      |  | 312 spends      | | 88 spends       | | 5 spends        |  |  (3-up desktop,
|      |  | 41% abort  [bar]| | 12% abort  [bar]| | 80% abort [bar] |  |   1-up mobile)
|      |  | last: 2m ago    | | last: 1h ago    | | last: 3d ago    |  |
|      |  +-----------------+ +-----------------+ +-----------------+  |
|      |                                                               |
|      |  Live spend stream            * live   [pause]   1,204 total  |  LiveSpendStream header
|      |  +---------------------------------------------------------+  |
|      |  | TIME  AGENT     RECIPIENT   AMOUNT    RISK    STATUS  > |  |  DataTable header (sticky)
|      |  +---------------------------------------------------------+  |
|      |  | 2m ago 0x42..d7 0x7c..a1   12.50 SUI  [88 CRIT] ABORTED |  |  rows, mono right-aligned
|      |  | 4m ago 0x42..d7 0x10..ff    0.50 SUI  [ 4 low ] CONFIRM |  |  amounts, RiskScore+RiskBadge,
|      |  | 9m ago 0x9a..1c 0x33..2b    2.00 SUI  [35 med ] CONFIRM |  |  StatusBadge, hover reveals >
|      |  +---------------------------------------------------------+  |
+------+---------------------------------------------------------------+
```

Clicking a stream row opens `SpendDrawer` from the right (or routes to
`/app/spend/[id]`).

### `/app/agents/[addr]` Agent profile

```
+------+---------------------------------------------------------------+
| NAV  |  Agent  0x42780ec3...69d7   [copy]  [Suiscan]                 |  header (Address atom)
|      |  +-----------+ +-----------+ +-----------+ +-----------+       |
|      |  | SPENDS 312| | ABORTS 128| | RATE 41%  | | LAST 2m   |       |  StatHeader (agent-scoped)
|      |  +-----------+ +-----------+ +-----------+ +-----------+       |
|      |                                                               |
|      |  [ Spend history ]  [ Abort timeline ]                        |  tabs
|      |                                                               |
|      |  Spend history                              312 total         |
|      |  +---------------------------------------------------------+  |
|      |  | TIME   RECIPIENT   AMOUNT    RISK     SIM    STATUS    > |  |  DataTable (byAgent)
|      |  | ...    0x7c..a1   12.50 SUI [88 CRIT] FAIL   ABORTED    |  |
|      |  +---------------------------------------------------------+  |
|      |                                                               |
|      |  Abort timeline (AbortRecorded events)                       |  ScrollX Timeline
|      |   |                                                          |
|      |   o  2m ago   high_risk     score 88   blob 0x..  [view]     |
|      |   o  1h ago   policy_block  score 70   blob 0x..  [view]     |
|      |   o  3h ago   sim_failed    score 100  blob 0x..  [view]     |
+------+---------------------------------------------------------------+
```

### `/app/spend/[id]` Spend detail (also the SpendDrawer content)

```
+----------------------------------------------------------------------+
|  Spend  receipt 0xab..9f          ABORTED  high_risk    [Suiscan]    |  header: StatusBadge + reason
+----------------------------------------------------------------------+
|  Intent                                                              |
|   Agent      0x42..d7         Wallet     0x6b..g5                    |  KeyValueRow grid
|   Recipient  0x7c..a1         Amount     12.50 SUI                   |  (Address / Amount atoms)
|   Coin       0x2::sui::SUI    Time       2026-06-16 14:08            |
+----------------------------------------------------------------------+
|  Reasoning chain                                  [ Decrypt w/ Seal ]|  DecryptControl (if sealed)
|   Model     gpt-4o                                                   |
|   Prompt    "Move treasury to cold wallet before ..."               |  mono code panel,
|   Decision  "Transfer 12.5 SUI to 0x7c..a1"                         |  scroll if long
|   ( If sealed and you are not on the allowlist: locked panel with    |
|     "Sealed to 2 auditors. Connect an allowlisted address." )        |
+----------------------------------------------------------------------+
|  Simulation report                          recommendation: ABORT   |
|   Sim       FAILED            Gas        0.0021 SUI                  |  KeyValueRow
|   Risk score                 [ 88 / 100  ============|== CRITICAL ]  |  RiskScore (segmented bar)
|                                                                      |
|   Risk flags                                                        |
|    [CRITICAL] DRAIN_DETECTED  Moves 92% of the wallet in one tx.    |  RiskFlagList
|    [HIGH]     UNKNOWN_RECIPIENT  Recipient not in the allowlist.    |
|                                                                      |
|   Policy violations                                                 |
|    UNKNOWN_RECIPIENT  Recipient is not in the policy allowlist.     |
|                                                                      |
|   Balance changes                                                  |
|    0x6b..g5   SUI   -12.50   (outflow, red)                         |  BalanceChangeRow
|    0x7c..a1   SUI   +12.50   (inflow, green)                        |
+----------------------------------------------------------------------+
|  On-chain + audit                                                   |
|   Receipt object   0xab..9f      [Suiscan object]                   |  KeyValueRow + links
|   Walrus blob      bafy..k3      [open blob]                        |  BlobLink
|   blake3           9f2c..71a      [copy]                            |
+----------------------------------------------------------------------+
```

For a confirmed spend the same layout shows StatusBadge CONFIRMED, a tx-digest
link, and recommendation PROCEED; the reasoning chain reads directly if public.

### `/docs` SDK quickstart

```
+----------------------------------------------------------------------+
|  PRAXIS  Docs                                   Dashboard  [GitHub]  |
+-------------------+--------------------------------------------------+
| On this page      |  Quickstart                                      |
|  Install          |   Install, configure a wallet adapter, gate      |
|  Configure        |   your first spend. Testnet, SUI only in v1.     |
|  Simulate         |                                                  |
|  Spend + gate     |  1. Install                                      |
|  Read the audit   |   +-------------------------------------------+  |
|  trail            |   |  pnpm add @praxis/sdk @mysten/sui         |  |  CodeBlock
|                   |   +-------------------------------------------+  |
|                   |  2. Configure  ... 3. Simulate ... 4. Spend     |  CodeBlock per step
|                   |   (each block is a real call from the SDK:       |
|                   |    new Praxis({ wallet }), praxis.simulate,      |
|                   |    praxis.spend, praxis.audit.recent)           |
+-------------------+--------------------------------------------------+
```

### Empty states (copy is final, plain ASCII)

- Live stream, no receipts yet: "No spends recorded yet. Run a spend through the
  SDK and it shows up here within a few seconds." + the install + spend snippet.
- Agent with no aborts: "This agent has not been blocked yet. Every spend so far
  passed the gate."
- Decrypt denied: "This reasoning is sealed to N auditors. Connect an allowlisted
  address to decrypt it."
- Walrus blob unreachable: "Could not load the reasoning blob from Walrus. The
  on-chain receipt is still valid; retry the blob fetch."

---

## 12. Microcopy (final, plain ASCII)

- Drains-prevented label: "drains prevented" (lowercase, the number does the work).
- Abort framing in detail: "Praxis blocked this spend." then the reason in plain
  words ("high_risk", "policy_block", "sim_failed", "agent_decision").
- Risk score caption: "0 to 100. Praxis blocks at 80 and flags for review at 30."
- Decrypt button: "Decrypt with Seal". After success: "Decrypted. Visible to you
  and N other auditors."
- Network badge tooltip: "Reading testnet. Package 0xb9e9...e32d."
- CTA primary: "Read the quickstart". CTA secondary: "Open the dashboard".
- Hero subhead (final): "Praxis simulates and risk-scores every spend before it
  signs, and writes the reasoning to an audit trail."

No banned vocabulary, no "empower / unlock / seamless / journey", no em dashes.

---

## 13. Anti-Patterns to Avoid

Informed by the references above and the product's compliance posture.

- No marketing gradients, no purple/pink hero, no abstract blobs. This is a
  security tool; the Evil Martians study and our own rules both say clean
  typography and white space beat flashy interaction for a developer audience.
- No color without meaning. Do not tint panels or chart bars in Sui blue or risk
  colors just to look lively. The Linear lesson: keep the field grey, spend color
  on signal only.
- No mock or seed data in any shipped view or screenshot. Empty states instead.
- No fake celebration of aborts and no shaming of them either. An abort is "a
  drain prevented", framed as protection, with audit-grade detail.
- No paginated table without a total count ("Page 3 of ?" is banned).
- No white text on a solid risk-color fill (fails contrast). Tinted chips with
  colored text, or near-black text on solid fills.
- No private keys or signing in the browser. The dashboard is read-and-decrypt
  only.
- No carousel as primary content, no modal on load, no animation over ~400ms, no
  animation that blocks interaction, no animating a money figure mid-read.
- No Inter as the primary face. Geist for UI, JetBrains Mono for data.
- No emoji as icons. Lucide only (shield-check, alert-triangle, flame,
  octagon-alert, lock, lock-open, check, external-link, copy).
- No truncating an address without copy-to-clipboard and an explorer link.

---

## 14. Open Questions (for the owner before build)

1. Viewer identity for decrypt: does the dashboard connect a Sui wallet (zkLogin
   per the README) to supply the `viewer` address for `audit.reveal`, or is the
   viewer set some other way in v1? The decrypt allowlist gate depends on this.
2. Live feed: poll `queryEvents` on an interval (simplest, ships now), or is there
   a websocket/subscription on the chosen RPC we should design the "live" dot
   around?
3. Agent list source: derive distinct agents from recent receipts (cheap, bounded
   by query limit), or do we want an indexer so the agent list is complete rather
   than "agents seen in the last N events"?
4. Scope check: is the spend detail a right-side drawer on `/app`, a full route at
   `/app/spend/[id]`, or both (drawer for quick look, route for deep link)? The
   inventory supports both; confirm the default.

---

## 15. Premium Atmosphere Redesign (current direction)

The dashboard kept the dense, trustworthy data semantics from sections 1-14 but
the surface moved from flat near-black to a "security command deck": a live
gradient atmosphere with glass panels floating on it. Wow for a hackathon
showcase, without losing the credibility a security tool needs. This section is
the contract for that layer.

### Thesis

Cinematic, not decorative. The motion lives in the background; the foreground
data stays still and legible. Color is still signal: the brand cyan and the four
risk colors keep their meaning, and the aurora is rationed so it never competes
with a risk badge or a money figure.

### The aurora (GradientField)

- A single fullscreen triangle running a custom domain-warped fbm-noise fragment
  shader, via `ogl` (~30kb). File: `components/visual/GradientField.tsx`. Lifted
  into the root layout so it sits behind the whole app at `z-0`; all content is
  wrapped at `z-10`.
- Palette: obsidian -> deep blue -> teal -> rationed brand cyan, a cool indigo
  (not violet), and a barely-there amber "threat" tint nodding at the risk reds.
  A soft cyan bloom pools low-center as the bright heart.
- Cheap and safe: DPR capped at 2, darkened toward the top so the nav reads,
  vignetted edges, fine grain to kill banding. Pauses on tab hide. Respects
  `prefers-reduced-motion` by rendering one static frame with no rAF loop.
- Dimmed behind the dashboard (AppShell paints a `rgba(8,10,14,0.8)` scrim over
  it) so dense data stays legible; full strength on landing and docs.

### Glass + glow utilities (globals.css)

- `.glass` - translucent panel, blur + saturate, hairline top sheen, soft lift.
  The default surface for cards, nav, the three-party nodes, the data table.
- `.glass-hi` - stronger glass for hero code card and the featured stat block.
- `.glass-solid` - near-opaque (0.96) glass for focused modals (spend drawer,
  command palette) so content behind never bleeds through. Paired with a
  `bg-black/70 backdrop-blur-sm` overlay.
- `.glow-accent` - cyan glow ring for the primary CTA and the drains-prevented
  stat. `.text-gradient` - white-to-cyan headline clip. `.grain` - fixed
  low-opacity film-grain overlay above content.

### Motion (supersedes section 7's "no WebGL backgrounds")

The aurora is the one ambient animation, and it is allowed precisely because it
is background, gated on reduced-motion, and paused when hidden. Everything in
section 7 about foreground motion still holds: micro-interactions 150-200ms,
drawer 280ms, the live counter count-up, single-row stream insertion. No
foreground element animates on a money figure mid-read.

### What did NOT change

Component inventory, data sources (section 9), real-data-or-empty, risk color
semantics and contrast rules (section 5), mono-for-truth, table density numbers
(section 6), accessibility. The redesign is a surface, not a re-architecture.
