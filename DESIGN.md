---
name: Solutio Installments
description: A Lagos-built ledger for tracking property installment plans — sharp, warm, money-first.
colors:
  paper-50:  "oklch(0.985 0.005 60)"
  paper-100: "oklch(0.970 0.007 60)"
  paper-200: "oklch(0.945 0.008 55)"
  paper-300: "oklch(0.910 0.010 50)"
  paper-400: "oklch(0.850 0.012 48)"
  ink-900:   "oklch(0.200 0.015 40)"
  ink-700:   "oklch(0.320 0.013 40)"
  ink-500:   "oklch(0.520 0.012 45)"
  ink-300:   "oklch(0.720 0.008 45)"
  clay-100:  "oklch(0.960 0.022 40)"
  clay-300:  "oklch(0.850 0.070 38)"
  clay-600:  "oklch(0.550 0.140 35)"
  clay-700:  "oklch(0.480 0.150 33)"
  status-overdue: "oklch(0.520 0.180 25)"
  status-paid:    "oklch(0.520 0.090 155)"
  status-pending: "oklch(0.560 0.040 240)"
  dark-bg:        "oklch(0.160 0.015 45)"
  dark-surface:   "oklch(0.215 0.014 43)"
  dark-ink-900:   "oklch(0.960 0.005 60)"
  dark-ink-500:   "oklch(0.680 0.010 50)"
  dark-clay-500:  "oklch(0.640 0.140 35)"
typography:
  display:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 1.4rem + 1.5vw, 2.25rem)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.005em"
  body:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.04em"
  amount:
    fontFamily: "Geist Mono, JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.9375rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "-0.01em"
    fontFeature: "'tnum' 1, 'cv11' 1"
rounded:
  sm: "4px"
  md: "6px"
  lg: "10px"
  xl: "14px"
spacing:
  "0.5": "2px"
  "1":   "4px"
  "2":   "8px"
  "3":   "12px"
  "4":   "16px"
  "5":   "20px"
  "6":   "24px"
  "8":   "32px"
  "10":  "40px"
  "12":  "48px"
  "16":  "64px"
components:
  button-primary:
    backgroundColor: "{colors.clay-600}"
    textColor: "{colors.paper-50}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.clay-700}"
    textColor: "{colors.paper-50}"
  button-ghost:
    backgroundColor: "{colors.paper-100}"
    textColor: "{colors.ink-900}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
  button-ghost-hover:
    backgroundColor: "{colors.paper-200}"
    textColor: "{colors.ink-900}"
  input-text:
    backgroundColor: "{colors.paper-50}"
    textColor: "{colors.ink-900}"
    rounded: "{rounded.md}"
    padding: "9px 12px"
    typography: "{typography.body}"
  input-text-focus:
    backgroundColor: "{colors.paper-50}"
    textColor: "{colors.ink-900}"
  card-surface:
    backgroundColor: "{colors.paper-100}"
    textColor: "{colors.ink-900}"
    rounded: "{rounded.lg}"
    padding: "20px"
  badge-overdue:
    backgroundColor: "{colors.clay-100}"
    textColor: "{colors.status-overdue}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
    typography: "{typography.label}"
  badge-paid:
    backgroundColor: "{colors.paper-200}"
    textColor: "{colors.status-paid}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
    typography: "{typography.label}"
---

# Design System: Solutio Installments

## 1. Overview

**Creative North Star: "The Lagos Ledger"**

Solutio reads like a serious ledger book kept by serious people in Lagos. Paper-warm surfaces, ink-dark text, one earthen accent reserved for the moments that actually demand attention. The numbers are the protagonist — every Naira amount renders in a precise tabular monospace so columns of money align like a balance sheet, not like a marketing page. Everything else gets out of the way.

The system borrows Linear's tool-native discipline (tight density, monospaced numerics, keyboard-fluent) and softens it with warm tinted neutrals and humanist copy. Sharp without coldness. The agent showing this screen to a buyer should look like they work for a firm that takes paperwork seriously — not one chasing the latest SaaS template.

This system explicitly rejects: default-shadcn slate-and-indigo, Nigerian bank navy-and-gold portal aesthetics, the dense-borders-everywhere Excel-replacement reflex, and any fintech-bro neon. None of those build trust around money owed.

**Key Characteristics:**
- Warm paper neutrals (subtle terracotta cast), never `#fff` or `#000`
- One signature accent: deep terracotta, reserved for primary actions only
- Tabular monospace for every monetary amount
- Hairline borders, no decorative shadows
- Density first, but with generous vertical rhythm in numeric columns
- Truly responsive: phone (360px) and laptop (1440px) are equally first-class
- Light by default, dark mode honest and warm

## 2. Colors: The Lagos Ledger Palette

A warm paper-and-ink foundation with a single earthen accent. Neutrals are never grey — every one carries a faint terracotta cast that ties to the accent without competing with it.

### Primary
- **Clay 600** (`oklch(0.550 0.140 35)`): the one signature color. Primary buttons, active navigation, the focused field's ring, the brand mark. Appears on **≤8% of any given screen**.
- **Clay 700** (`oklch(0.480 0.150 33)`): hover and active states for clay 600. Never used at rest.
- **Clay 300** (`oklch(0.850 0.070 38)`): subtle border on tinted clay backgrounds.
- **Clay 100** (`oklch(0.960 0.022 40)`): tinted background for overdue badges and brand-tinted callouts.

### Neutral (paper + ink)
- **Paper 50** (`oklch(0.985 0.005 60)`): the canvas. Page background. Input field background.
- **Paper 100** (`oklch(0.970 0.007 60)`): default card and panel surface. Sidebar.
- **Paper 200** (`oklch(0.945 0.008 55)`): hover state for paper 100, table row stripes (when used).
- **Paper 300** (`oklch(0.910 0.010 50)`): hairline borders on resting elements.
- **Paper 400** (`oklch(0.850 0.012 48)`): stronger borders, table dividers.
- **Ink 900** (`oklch(0.200 0.015 40)`): headlines, primary text. Warm near-black, never pure.
- **Ink 700** (`oklch(0.320 0.013 40)`): body text.
- **Ink 500** (`oklch(0.520 0.012 45)`): muted text, labels, secondary information.
- **Ink 300** (`oklch(0.720 0.008 45)`): disabled text and placeholders.

### Tertiary (status semantics — used only where status meaning is essential)
- **Status Overdue** (`oklch(0.520 0.180 25)`): overdue badge text, overdue row highlights. Hotter than terracotta so it reads as warning, not brand.
- **Status Paid** (`oklch(0.520 0.090 155)`): muted forest, on paid receipts and completed schedule rows. Quiet on purpose.
- **Status Pending** (`oklch(0.560 0.040 240)`): cool slate, on forecasted/upcoming payments.

### Dark mode (companion palette)
- **Dark BG** (`oklch(0.160 0.015 45)`): warm dark canvas. Never `#000`.
- **Dark Surface** (`oklch(0.215 0.014 43)`): card and panel surface.
- **Dark Ink 900** (`oklch(0.960 0.005 60)`): primary text.
- **Dark Clay 500** (`oklch(0.640 0.140 35)`): the accent lifted slightly so it survives the dark canvas.

### Named Rules
**The Clay-Once Rule.** The terracotta accent appears on at most one element per screen at any moment — the primary action, OR the focused field's ring, OR the active nav item. Never two. Reserve it. The accent's rarity is what makes it readable as the call to action.

**The Warm Neutrals Rule.** Every neutral carries a measurable chroma toward the brand hue (typical range 0.005–0.012 chroma). Pure-grey neutrals (chroma 0) are forbidden. So is `#fff` and `#000`.

**The Status-Trio Rule.** Status colors (overdue, paid, pending) appear only on semantic indicators — badges, row highlights, dot markers. They never appear on actions, headers, or decorative chrome. Color alone never carries meaning: status always pairs color + icon + label.

## 3. Typography

**Display & Body Font:** Inter Variable (with `system-ui, sans-serif` fallback)
**Money & Identifier Font:** Geist Mono (with `JetBrains Mono, ui-monospace, monospace` fallback)

**Character:** A single humanist sans does almost all the work — warm enough that body copy doesn't feel sterile, sharp enough that headlines feel decisive. Inter's `cv11` stylistic set (single-storey `a`) is enabled to soften the geometry. Money, IDs, and dates in tables shift to a tabular monospace so columns of figures actually align — the visual signal that this product takes numbers seriously.

### Hierarchy
- **Display** (weight 700, clamp(28px, 1.4rem + 1.5vw, 36px), line-height 1.05, tracking −0.02em): page heroes and onboarding moments. Used **at most once per screen**, often not at all.
- **Headline** (weight 600, 24px, line-height 1.15, tracking −0.015em): section titles, sheet titles, primary card titles.
- **Title** (weight 600, 18px, line-height 1.3, tracking −0.005em): card titles, list-row primary text, drawer headings.
- **Body** (weight 400, 14px, line-height 1.5): default. Max line length **65–75ch** on prose. Table cells drop to **13px** when density justifies it.
- **Label** (weight 500, 12px, line-height 1.3, tracking +0.04em, **uppercase**): column headers, form-field labels, micro section dividers. Use sparingly — uppercase is loud.
- **Amount** (Geist Mono, weight 500, 15px, line-height 1.3, tracking −0.01em, `font-variant-numeric: tabular-nums`): every Naira amount, schedule date, plan ID, reference number.

### Named Rules
**The Money-in-Mono Rule.** Every ₦ amount renders in the mono family with `font-variant-numeric: tabular-nums`. Columns of money always align on the decimal. No exceptions — not even on the "Total Outstanding" hero number, not even on a button label.

**The Naira-Native Rule.** Currency: `₦` prefix (not `NGN`, not `N`), Nigerian digit grouping (₦12,500,000), no superscript decimals on whole-Naira amounts. Dates: `DD MMM YYYY` (15 May 2026), never `05/15/26`. Schedules show "Month 3 of 24" alongside the absolute date.

**The Quiet-Display Rule.** Display size appears at most once per screen. If a screen needs two big headings, one is wrong — pick the actual hero.

## 4. Elevation

This system is **flat by default**. Depth comes from warm-paper tonal layering — paper 50 (canvas) under paper 100 (card) under paper 200 (raised) — and from a single 1px hairline border in paper 300 or paper 400. Shadows appear **only** on elements that genuinely leave the plane: sheets, popovers, dropdowns, and the focus ring.

### Shadow Vocabulary
- **Sheet & popover** (`box-shadow: 0 2px 8px -2px oklch(0.20 0.015 40 / 0.08), 0 8px 24px -8px oklch(0.20 0.015 40 / 0.10)`): used for off-canvas sheets (mobile), dropdowns, comboboxes, and the command palette.
- **Focus ring** (`box-shadow: 0 0 0 3px oklch(0.55 0.14 35 / 0.22)`): the focused element's clay halo. The only place clay appears as a glow.

### Named Rules
**The Hairline Rule.** Resting cards, table rows, and panels use a 1px paper 300 border. No drop shadows on resting surfaces. Ever.

**The Lift-Only-On-Move Rule.** Shadows signal that an element has left the plane (sheet, popover, modal). If the element is staying put, it doesn't get a shadow.

## 5. Components

### Buttons
- **Shape:** gently rounded (6px / `rounded.md`), tight not pillowy.
- **Primary:** clay 600 background, paper 50 text, 10px × 16px padding, body type. Hover shifts to clay 700; no scale, no shadow.
- **Ghost:** paper 100 background, ink 900 text, 1px paper 300 border. Hover shifts to paper 200.
- **Destructive:** status overdue background, paper 50 text. Used only on irreversible actions (delete buyer, void plan).
- **Focus:** clay focus ring (3px clay 600 at 22% alpha). Visible always; `outline: none` without replacement is forbidden.
- **Disabled:** ink 300 text, paper 200 background, `cursor: not-allowed`. No opacity tricks.
- **Density:** one primary per screen. Two is wrong — promote one, demote the other.

### Inputs / Fields
- **Style:** paper 50 background, 1px paper 400 border, 6px radius, 9px × 12px padding, ink 900 text, ink 300 placeholder.
- **Focus:** border shifts to clay 600, focus ring appears (3px clay 600 at 22% alpha). No glow on the input fill.
- **Money input:** mono amount type, `inputmode="decimal"`, `₦` prefix as a non-editable adornment inside the field, right-aligned digits.
- **Error:** border shifts to status overdue, message in status overdue under the field with an inline `AlertTriangle` icon.
- **Disabled:** paper 200 background, ink 300 text, no border shift on hover.

### Cards & Surfaces
- **Default:** paper 100 background, 1px paper 300 hairline, 10px radius (`rounded.lg`), 20px internal padding. No shadow.
- **Nested cards are forbidden.** If two pieces of content both want a card, the inner one is a list, an inline block, or a divider — not a smaller card inside the outer card.
- **Compact list row:** paper 50 background, 1px paper 300 bottom-border only, 12–16px vertical padding. Used for buyer search results, schedule rows, payment history.

### Tables
- **Header:** label type (uppercase, 12px, +0.04em tracking), ink 500 text, paper 100 background, 1px paper 400 bottom border.
- **Row:** 13px body text, ink 700, paper 50 background. Row height: 44px desktop / 56px touch.
- **Money column:** mono `amount` type, right-aligned, tabular nums. Overdue rows: status overdue text on amount + a subtle status overdue 4% wash on the row.
- **Mobile:** at <768px, the table becomes a vertical stack of compact "row cards" — primary label + amount left-right, secondary line below in ink 500. Never a horizontal scroll on phones.

### Navigation
- **Desktop:** vertical sidebar on paper 100, 240px wide. Nav items at 14px / weight 500 / ink 700. Active item: clay 600 text + 2px clay 600 left rule (1px is too thin to read; this is the one place a left-edge rule is allowed because it functions as a position marker, not decoration). Hover: paper 200 fill.
- **Mobile:** bottom tab bar, 5 items max, 56px tall, icon + 11px label. Active item: clay 600 icon + label. No active fill — just color.
- **Page header:** sticky 56px top bar, paper 50 background, 1px paper 300 bottom border. Page title in title type. Right-aligned: page-level primary action (one only).

### Badges (status indicators)
- **Overdue:** clay 100 background, status overdue text, 4px radius, label type, leading `AlertTriangle` icon (12px).
- **Paid:** paper 200 background, status paid text, leading `CheckCircle2` icon.
- **Pending:** paper 200 background, status pending text, leading `Clock` icon.
- **Plot status (sold/reserved/available):** same shape, paper 200 background with ink 700 text, distinguished by leading label word, not by color.

### Signature: The Money Cell
The single most distinctive component: every cell that displays a Naira amount. Specification:
- Mono family, tabular nums, right-aligned.
- `₦` prefix in ink 500 at body weight, value in ink 900 at amount weight.
- Below the value (optional, used in list rows): a 11px ink 500 caption — "of ₦24,000,000" total, or "due 15 May 2026", or "Plan 12 of 24".
- On overdue rows the value shifts to status overdue color; the prefix stays ink 500 to keep the symbol from screaming.

## 6. Do's and Don'ts

### Do:
- **Do** put every Naira amount in Geist Mono with `font-variant-numeric: tabular-nums`.
- **Do** use paper-warm neutrals (chroma 0.005–0.012 toward hue ~50) instead of pure grey.
- **Do** reserve clay 600 for one element per screen — the actual primary action.
- **Do** use 1px paper 300 hairline borders on resting cards and rows.
- **Do** combine color with an icon and a label for every status. Color alone is never the signal.
- **Do** show "₦12,500,000" with proper digit grouping; format dates as "15 May 2026".
- **Do** drop the table to a vertical stack of row cards under 768px, never a horizontal scroll.
- **Do** keep the focus ring visible on every interactive element — clay 600 at 22% alpha, 3px.
- **Do** respect `prefers-reduced-motion` — motion is decoration here, never information.

### Don't:
- **Don't** use the default shadcn slate-and-indigo palette. Replace `--primary`, neutrals, and `--ring` before shipping any screen.
- **Don't** use navy-and-gold, gradient buttons, or any other Nigerian-bank-portal cue. We are the alternative to that aesthetic, not a variation on it.
- **Don't** drown the screen in identical card grids. If three things want to be cards, one is probably a list and one is probably a panel.
- **Don't** nest cards inside cards.
- **Don't** use gradient text (`background-clip: text`). Solid colors only.
- **Don't** use a left-edge colored stripe on cards or list items as decoration. The single exception is the **active nav item** (2px clay 600), where the stripe is a position marker.
- **Don't** use glassmorphism, blurs, or neon glows.
- **Don't** show a Naira amount in a proportional font, ever. Not even in a button label, not even in a tooltip.
- **Don't** use `#fff`, `#000`, or `outline: none` without a replacement focus treatment.
- **Don't** use em dashes in copy. Commas, colons, semicolons, or periods.
- **Don't** end an empty state with "!" or "Awesome!". The voice is plain and confident, not chirpy.
- **Don't** animate layout properties (`width`, `height`, `top`, `left`). Animate `transform` and `opacity` only.
- **Don't** assume USD or DD/MM/YYYY US formats. Naira and `DD MMM YYYY` are the defaults, period.
