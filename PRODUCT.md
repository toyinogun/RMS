# Product

## Register

product

## Users

**Primary:** Sales agent / relationship manager at a Nigerian real estate firm (anchor customer: Atrium Homes). Their week is split between the office and the field — pulling up a buyer's plan on their phone while standing on a half-built plot, then posting a payment from their laptop back at the desk. They open Solutio dozens of times a day to answer one of three questions: *how much does this buyer owe, when, and is anything overdue?*

**Secondary:** Finance officer (posts receipts, reconciles, generates statements), and the firm owner/director (glances at portfolio health: cashflow expected this month, plots in default, plans nearing payoff).

Context: bandwidth is metered, devices range from a five-year-old Android to a current MacBook, and the agent is often using the app *in front of the buyer* — the screen is a trust signal, not an internal tool.

## Product Purpose

Solutio replaces the spreadsheet-and-WhatsApp workflow Nigerian real estate firms use to track property installment payment plans. It is the single place where buyers, properties, payment schedules, and posted receipts live. Success looks like:

- A sales agent can answer "what's outstanding on Plot 12, Cedar Estate?" in under five seconds from their phone.
- A finance officer closes the month without exporting to Excel.
- The owner trusts the arrears number on the dashboard enough to act on it.

The job-to-be-done is **certainty about money owed and money paid**, not "manage real estate."

## Brand Personality

**Confident. Sharp. Warm.**

Voice: a finance professional who happens to be from Lagos — speaks plainly, never apologizes for density, but doesn't perform coldness either. Numbers are the protagonist; copy is the supporting cast. No exclamation marks. No "Awesome!" empty states. Money is named in Naira (₦), formatted with the proper grouping, and never softened with emojis.

Emotional goal: when an agent shows Solutio to a buyer, the buyer should feel the firm is serious — the kind of firm whose paperwork actually adds up.

## Anti-references

Solutio must **not** look or feel like:

- **Default-shadcn SaaS.** Slate-and-indigo, default card grid, "Welcome back, [name]!" hero, gradient CTAs. Every Next.js side project. The reflex output of an AI.
- **Nigerian bank / government portal.** Crowded layouts, navy-and-gold, late-2000s gradient buttons, low contrast, misaligned forms, modal-for-everything. The aesthetic Solutio's customers are *fleeing*.
- **Excel-with-borders.** A wall of identical dense tables on every screen, no hierarchy, no rhythm. Replacing the spreadsheet means thinking *past* the spreadsheet, not skinning it.
- **Crypto / fintech-bro.** Neon gradients, glassmorphism, rotating 3D, "next-gen finance" marketing energy, dark-by-default-because-tools-look-cool-dark. Wrong register and wrong audience.

## Design Principles

1. **Sharp without coldness.** Borrow Linear/Vercel precision — tight density, monospaced numerics, keyboard-fluent — but soften the neutrals and humanize the copy. The agent is a person, the buyer is a person, and a debt schedule is a difficult conversation. The UI acknowledges that.

2. **Naira-native, not Naira-tolerant.** Money is the protagonist. ₦ symbol, Nigerian digit grouping (₦12,500,000), schedules in months from contract start, dates that read DD MMM YYYY. Never assume USD, never default to American formats, never treat localization as a switch flipped at the end.

3. **Truly responsive, not "mobile-friendly".** The same product works at 360px and 1440px. No stripped-down mobile fallback. A table that becomes a stack of compact rows on phone, a side panel that becomes a sheet, a keyboard shortcut that becomes a long-press. One product, two ergonomic gears.

4. **Refuse the SaaS reflex.** Every clichéd shortcut — gradient text, indigo primary, identical card grids, hero-metric template, "AI sparkle" empty states — is on the do-not-build list. Reach for the second answer, not the first.

5. **Bandwidth-aware by design.** Metered 4G is the realistic baseline. Aggressive code-splitting, no decorative video, no 200kb hero images, no Lottie for the sake of it. Speed is a feature of the brand.

## Accessibility & Inclusion

- **Target: WCAG 2.2 AA.** All interactive targets ≥44×44 on touch, all body text ≥4.5:1 contrast against background, focus rings always visible (never `outline: none` without replacement).
- **Reduced motion** respected via `prefers-reduced-motion` — motion should never carry meaning that's lost when disabled.
- **Color is never the only signal** — overdue state uses color + icon + label.
- **English only** for v1, but copy avoids US idioms and assumes Nigerian English conventions (estate, plot, off-plan, instalment plan).
- **Forms designed for thumbs** on the field-mobile path: large tap targets, single-column on mobile, numeric keypads invoked on money inputs.
