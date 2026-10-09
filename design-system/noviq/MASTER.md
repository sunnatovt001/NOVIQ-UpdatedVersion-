# NOVIQ product design direction

Status: working design system for the foundation redesign. The product name and
logo are intentionally treated as replaceable brand assets.

## Product idea

NOVIQ is a focused learning workspace for students who want to plan, study,
practice, and review without switching between distracting apps. The interface
should answer one question first: “What should I study next?”

## Visual direction

- Calm and modern, with controlled color rather than a white-only or rainbow UI.
- Flat, fast surfaces. Borders and spacing communicate hierarchy; shadows are rare.
- One memorable element: the daily study path on Today. Supporting screens stay quiet.
- Motion confirms actions. No decorative blur transitions or continuous ambient motion.

## Temporary tokens

These tokens remain easy to replace after the final name and logo are selected.

- Canvas: `#F4F6FA`
- Surface: `#FFFFFF`
- Ink: `#172033`
- Muted ink: `#667085`
- Border: `#DCE2EC`
- Primary cobalt: `#315EFB`
- Primary soft: `#E9EFFF`
- Progress mint: `#2E9D75`
- Attention amber: `#D88920`
- Dark canvas: `#0B1220`
- Dark surface: `#131D2E`
- Dark border: `#27344B`

Functional success, warning, and error colors do not become decorative accents.

## Typography

- Product UI: Plus Jakarta Sans, then system sans-serif fallback.
- Data uses tabular figures.
- Sentence case for navigation, labels, and buttons.
- Body copy stays at 16px where reading is the primary activity.

## Layout

Desktop shell:

```text
┌──────────────┬─────────────────────────────────────────────┐
│ compact nav  │ Today / current context       account      │
│              ├───────────────────────────┬─────────────────┤
│ 5 main areas │ next study action         │ daily progress  │
│              │ today’s plan              │ upcoming        │
│              ├───────────────────────────┴─────────────────┤
│ account      │ recent work / contextual tools             │
└──────────────┴─────────────────────────────────────────────┘
```

Mobile shell:

```text
┌─────────────────────────┐
│ context         account │
├─────────────────────────┤
│ next study action       │
│ today’s plan            │
│ progress                │
├─────────────────────────┤
│ Today Plan Tutor Library│
└─────────────────────────┘
```

- Mobile gets at most five primary destinations.
- Focus is a prominent contextual action, not another permanent mobile tab.
- Community and detailed analytics stay secondary until the core learning loop is proven.

## Interaction rules

- 44px minimum touch targets.
- 150–200ms interaction feedback; only transform and opacity animate.
- No `transition: all` in redesigned components.
- Respect `prefers-reduced-motion`.
- Every loading, empty, error, and offline state gives a next action.
- English is the default locale; Uzbek and Russian use the same translation keys.

## Self-critique

The first palette proposal used the common teal-and-orange SaaS combination. It
was rejected as too generic and disconnected from the current blue visual cue.
The revised cobalt system is calmer, more academic, and keeps secondary colors
functional. Card-heavy dashboard patterns are also rejected in favor of a
single daily path with progressively disclosed supporting information.
