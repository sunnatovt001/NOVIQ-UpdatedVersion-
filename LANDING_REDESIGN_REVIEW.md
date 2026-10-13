# NOVIQ public landing redesign — manual review

## Latest hero revision: supplied student illustration

The current public hero uses LandingStudents.tsx, replacing the earlier brain
component described in the historical report below. The user's exact two-student
illustration is retained as students-original.png, with a 127,606-byte WebP
delivery asset. No generative changes were made to the characters.

Floating educational badges and restrained orbit motion use CSS transforms only;
the character illustration itself stays intact. The corner Pause control was removed
at the user's request. Badges have staggered drift timing, and offscreen pauses retain
their animation phase. Motion respects offscreen
visibility, hidden tabs, reduced-motion and Save-Data. The hero no longer requests
brain video. The existing auth CTAs and other application pages are unchanged.

Latest executed checks: 147 frontend + 33 functions tests passed; all 21 language/
viewport landing cases passed; 7 final visual-width checks passed. TypeScript and
production build passed. This revision has no new Lighthouse measurement.

Date: 2026-10-13 (Asia/Tashkent). Local implementation only; no commit, push or deployment.

## Scope and audit

The signed-out entry point is `src/pages/Landing.tsx`, rendered by the existing
`src/App.tsx` auth gate. Stack: React 19, Vite 6, Tailwind 4, existing Inter font,
Lucide icons and the existing deferred AuthDialog. No dependencies were added to
package.json or the lockfile.

No project AGENTS.md or components.json was found. Frontend Design, Redesign
Existing Projects, UI/UX Pro Max, React Best Practices and Verification guidance
informed the implementation: scoped styles, factual copy, native controls,
reserved media dimensions, motion preferences, and explicit test boundaries.

The dashboard semantic tokens take priority: text #14213d, muted #52627a,
border #d8dee7, surface #ffffff, soft #eef4ff. Primary landing actions reuse
#315efb / #264ed8 from the actual Today dashboard's .today-primary-button.
No global styles, authenticated layouts, auth handlers, backend, schema,
API contracts, student records or secrets were changed in this task.
24 protected page/context/backend files matched their pre-task SHA-256 baseline.

## Implementation files

Modified public UI:
- src/pages/Landing.tsx
- src/pages/Landing.css

New focused modules:
- src/features/landing/LandingBrain.tsx
- src/features/landing/landingContent.ts

New assets:
- public/noviq-brain-loop.mp4 (1,814,345 bytes)
- public/landing/dashboard-empty-desktop.webp
- public/landing/dashboard-empty-desktop-small.webp
- public/landing/dashboard-empty-mobile.webp
- public/landing/dashboard-empty-mobile-small.webp

Existing NOVIQ logo and brain poster are reused. The earlier LandingReference.css
is no longer imported; the current page uses one stylesheet.

Reproducible asset helpers:
- scripts/build-landing-brain.cjs (original footage restored from Git into artifacts)
- scripts/capture-landing-showcase.cjs (genuine empty-account UI, no production writes)

Tests added/updated:
- tests/landing-contract.test.cjs
- tests/landing-redesign.cjs
- tests/landing-accessibility.cjs
- tests/landing-mobile.cjs
- tests/performance-foundation.test.cjs
- tests/deferred-auth-browser.cjs
- tests/browser-check.cjs

## Visual and functional changes

White/pale-blue public page; navy two-line headline; real NOVIQ logo; royal-blue
CTAs; restrained glass-like layers/orbits around the brain; six exam-category
pills; three factual benefit cards; authentic laptop/phone dashboard showcase;
six working feature cards; pale-blue final CTA; minimal footer.

English hero: “Make exam prep / make sense.” EN/UZ/RU copy is complete.
No invented reviews, learner counts, school logos, progress percentages or demo.
The AI card does not promise 24/7 uptime; AI limits are stated accurately.
Resources/About/legal/social destinations were not invented.

Home, Features and Exam Tracks use working in-page anchors with reduced-motion
aware scrolling and focus transfer. Start free opens the unchanged signup modal;
Sign in opens the unchanged login modal. Feature cards select existing routes
(planner, flashcards, focus, analytics, tutor, notes) and open signup, preserving
the intended destination through the existing auth gate.

The showcase is captured from actual app components with an isolated empty
account and is labelled accordingly. It is not a synthetic dashboard or evidence
of a real learner's progress. Its source screenshots remain in artifacts.

## Brain motion

The original implementation is rendered video, not a live WebGL renderer. Its
full original rotating footage is encoded as muted H.264, 640px wide, 24 fps,
looping inline video. It is not replaced by a static screenshot.

A blue/white CSS treatment, orbital outlines, pedestal and restrained floating
elements match the supplied reference while retaining the original asset.

The video pauses offscreen (IntersectionObserver), in a hidden tab, or when the
user presses Pause. Reduced-motion and reduced-data/Save-Data disable the video
request entirely and use the existing poster. Playback rejection/media failure
has a poster fallback. No frame-by-frame React state or extra motion dependency.

## Responsive behavior

Desktop: two-column hero and three-column feature grid. Tablet: scaled visual
and two-column feature grid. Mobile: single-column hero with CTA before the
brain, stacked benefit/feature cards, compact keyboard-accessible navigation,
scaled laptop/phone showcase and no horizontal overflow.

All target widths were exercised in all three languages: 320, 375, 390, 768,
1024, 1440 and 1920 CSS px.

## Executed verification

- npm run lint: passed (TypeScript).
- npm --prefix functions run lint: passed.
- npm test: 147 frontend tests + 33 functions tests passed; zero failures.
- npm run build: passed, latest build 10.16 seconds on this machine.
- Full existing browser-check.cjs: 30 scenarios passed, including authenticated
  page navigation/themes, outages/retry, auth validation and modal focus.
- Updated auth-only browser regression: 8 scenarios passed after final changes.
- deferred-auth-browser.cjs: 3 scenarios passed, including the real 15-second
  deferred-module deadline/retry and focus restoration.
- landing-mobile.cjs: 6 EN/UZ/RU compact-viewport cases passed, with signup visible.
- landing-redesign.cjs: 21 viewport/language cases passed; anchors, six feature
  destinations, mobile menu focus/Escape, signup/signin entry, decoding, playback,
  manual/offscreen pause, reduced-motion, image decoding and overflow checked.
  No runtime page errors or production writes in these isolated cases.
- production-build axe check: 31 rules passed, zero WCAG/best-practice violations.
- Save-Data check: video neither mounted nor downloaded.

Browser auth tests use isolated fixtures/intercepted provider failures. They
validate UI entry and existing modal behavior, not real provider sign-in.
No live accounts or production data were modified.

## Measured Lighthouse and limitations

Local production preview, Lighthouse 13.5.0 default simulated mobile:
- Performance: 74
- Accessibility: 100
- Best Practices: 100
- SEO: 100
- FCP: 2.9 s; LCP: 4.9 s; total blocking time: 60 ms; CLS: 0.

Reports: artifacts/landing-redesign/lighthouse-mobile.json and accessibility.json.
These are local measurements, not claims about hosted production speed.
The labelled-control advisory in the Lighthouse snapshot was subsequently fixed
using native button names; the targeted final axe audit reported zero violations.

Poster and responsive showcase variants are in place. The public entry still
inherits existing client-side/auth SDK startup and shared CSS/JS costs. Improving
those architectural costs was deliberately kept outside this landing-only task.
Performance is not yet a 90+ mobile result; further load-path optimization merits
separate approval if it touches auth initialization or app-wide bundling.

Other limitations: genuine screenshots currently show the English app UI; page
copy remains localized. Real iOS/Safari device testing and hosted deployment
testing were not performed. Privacy/terms pages and a real demo are not present
and were not fabricated.

## Manual review

Open the existing dev site at http://localhost:3000/ while signed out and refresh.
The built preview is also available at http://127.0.0.1:4173/ during this session.
Screenshots: artifacts/landing-redesign/en-1440.png and en-390.png.

Ready for manual visual/interaction review. No automatic GitHub push or deploy.
