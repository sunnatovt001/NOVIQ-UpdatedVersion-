# NOVIQ Pro dashboard

## Free Dashboard

### Free Library

The approved Free Library concept governs `free-library.css`: a 31px heading and shared Create note/Upload/Link actions above a 230px collection rail, flexible editor and 290px Notebook AI panel. Notes precede sources in the rail. The large rounded workspace shell stays visible. Existing cloud save, upload, link, delete, highlight and Notebook AI handlers remain authoritative; mock notes and sources from the concept are never inserted. The plain-text editor exposes explicit Markdown formatting buttons for bold, italic and lists; it does not pretend to be a rich-text renderer. Save remains an explicit existing action.

White matte panels, blue controls and readable navy text match Free Dashboard/Planner/Tutor, with opaque navy dark surfaces. Tablet and mobile retain the existing editor/source/AI view controls. The AI footer reserves space above the floating assistant. Existing source citation messaging, six AI tools, errors and retry behavior remain available. Reduced motion disables cosmetic transitions, and Pro Library uses its separate component unchanged.

### Free Tutor

The approved Free Tutor concept governs `free-tutor.css` and the FreeTutor component. The white chat workspace uses a 235px history rail, restrained blue selection, readable navy message text, pale-blue assistant bubbles and royal-blue user messages without heavy shadows. The composer retains existing file/image uploads, voice recording, keyboard send and quota/error feedback. Suggested actions only fill the input; they do not send automatically. The Stop speech control appears only during speech. Actual conversation history and saved messages remain authoritative; example conversations from the mockup are not inserted.

Desktop separates history and chat with a 12px gap and 14px corners. Tablet/mobile retain the accessible history drawer, stack header controls and keep the input in view. Navy opaque panels support dark mode and reduced motion disables cosmetic transitions. The existing automatic reply-language indicator remains informational. Pro Tutor uses its separate component and is unchanged.

### Free Planner

The approved Free Planner concept extends the same matte blue-and-white shell to the planner route through `free-planner.css`. A 34px heading sits above history, setup and Add task actions, a distinct save/timezone/backup strip, then a 235px assignment rail and flexible calendar. Assignment search filters actual subject names and task titles without changing saved data. The calendar preserves existing time windows, commitments, sessions, drag controls, task forms and day/week navigation; no decorative sample tasks or availability are inserted. Empty assignments use an outline calendar icon. Tablet stacks the rail above the calendar; mobile retains the existing agenda behavior and accessible controls. Navy opaque panels support dark mode. These styles are scoped to the Free planner and do not change Pro geometry or materials.

The approved blue-and-white Free concept governs the `freeDesign` variant of TodayDashboardView and `features/free/free-dashboard.css`. NOVIQ retains royal blue #345cff, navy #192640, opaque white cards and a very pale #f8faff canvas. Green is not the brand accent. Free differs from Pro through matte materials and restrained panels, with no liquid-glass background or orbital artwork. The dashboard keeps actual next-task actions, task completion, focus totals, daily targets, library counts and weekly activity. Empty/loading/error/retry states remain truthful; sample image values are never seeded.

Desktop uses a compact 242px expanded sidebar (84px collapsed), full visible primary navigation, a small Pro discovery link, account footer, and a 1.65:1 content split. Cards use 14px corners, the next-step panel uses pale blue, and icons use the incumbent library. Focus has a direct start action and Quick tools exposes Tutor, notes, Planner and flashcards. The command field retains its existing routing behavior. Tablet condenses columns; mobile stacks them and retains the existing drawer and bottom navigation. Dark mode uses opaque navy panels. Reduced motion disables decorative transitions. The Free dashboard styles and layout class do not apply to the Pro dashboard.

The user-provided blue glass reference is the visual authority for the entitled dashboard only. Existing foundation standards in design-system/noviq/MASTER.md continue to govern Free and other surfaces.

## Pro Progress

The approved second Progress concept governs `GlassProgress.tsx` and `glass-progress.css`: a 40px heading, Week/Month control, wide primary study-duration panel, streak and all-time completed-task counts, then a 1.65:1 daily bar chart/consistency grid and a recent-session/next-step row. The shared sidebar, account avatar and bottom-right Saidamin launcher remain unchanged. Pale-blue glass surfaces, cobalt actions, navy typography and 20px panel corners inherit the Pro identity; dark mode uses navy panels and pale ink.

Week and month use Asia/Tashkent calendar boundaries. Targets derive from the saved daily target and the actual number of days in the selected period. Session totals, durations, heatmap intensity and the three most recent sessions come from existing study evidence. The heatmap contains exactly 35 dates aligned Monday–Sunday across five calendar weeks including the current week; future dates have dashed outlines. Tasks are explicitly labeled all-time, without an invented denominator. Existing metrics failures remain visible with retry, and unavailable values show a dash. Empty history remains truthful. Tablet condenses spacing; mobile stacks the panels and keeps controls usable without horizontal overflow. Reduced motion disables chart and control transitions. The image's sample records and values are never seeded into accounts.

## Pro Profile

The approved Profile concept governs the Pro-scoped `glass-profile.css`. A 38px heading leads into a roughly 1:2 identity/settings layout. The left panel shows the actual selected photo, four existing premium presets, photo upload and membership link. The right side uses Personal details, Preferences and Security controls. Personal details retains the existing name, sign-in email, academic status and daily-target fields; the concept's placeholder username and unsupported learning-goal options are not invented. Editing and avatar saves retain server acknowledgement and error feedback. Upload limits remain the existing 8 MB.

Language uses the shared locale context. Light/dark controls update the shared Pro shell theme, including the existing header control. Notifications retain the three actual saved preference types. Security shows available sign-in provider information and the Telegram connection controls; password accounts may explicitly request a reset email. No email is sent merely by viewing this tab. Missing provider metadata does not block rendering. Desktop uses pale glass surfaces, 20px panel corners, cobalt controls and a circular avatar; navy glass supports dark mode. Tablet condenses fields, and mobile stacks identity before settings with no horizontal overflow. The shared sidebar and bottom-right assistant remain unchanged; reduced motion disables cosmetic transitions.

## Admin operations

The approved Admin image governs `glass-admin.css`: compact summary strip, a cobalt daily activity chart with a users/product-events selector, proportional Free/Pro subscription bars, searchable user table, and a lower System health panel. Overview shows three matching user rows; Users exposes the full existing table, including goal, level, activity, streak and study duration. Subscriptions retains payment operations, AI usage retains product and growth analytics, and System health retains access controls and all collected client reports. Existing admin authorization and mutation handlers remain unchanged. Sample users and metrics exist only in the isolated browser preview, never in production data.

The Today/7 days/30 days control continues to drive existing range calculations. Source-load warnings remain visible and expandable. Client reports are sampled; the compact Overview shows the latest collected report while System health shows the full available list. No missing reports imply a healthy platform. Tables keep keyboard-accessible Open actions and labeled filters. The shared Pro sidebar and bottom-right assistant retain their positions. Tablet condenses metrics and forms; mobile scrolls the tab bar and wide tables inside their own panels. Navy glass supports dark mode and reduced motion disables cosmetic transitions.

## Plans and membership

The approved Plans image governs `glass-plans.css`: a compact left-aligned heading, centered Monthly/Annual selector, equal Free/Pro glass cards, a short confidence strip and expandable FAQs. Actual feature descriptions and configured prices remain authoritative. The Pro card uses readable navy text on ice-blue glass, with navy surfaces and pale text in dark mode. Existing membership status, expiry, quota, trial eligibility, payment availability and error feedback remain visible. Verified Pro accounts receive a current-plan badge and a Manage membership action that moves keyboard focus to the existing management section. Payment provider selection remains available in an expandable checkout section; browsing the page never initiates a purchase or cancellation.

Desktop uses 22px plan-card corners, 44px prices and cobalt actions; tablet condenses feature descriptions and mobile stacks the cards. Controls retain visible focus and reduced-motion support. Shared navigation and the bottom-right assistant retain their geometry. Prices and payment handlers remain unchanged.

- Typography: existing Plus Jakarta Sans; ink #080f3d, secondary #50659c. Desktop greeting 40px, section titles 20px, body 14–16px. Tabular data.
- Palette: icy blue #dfecff canvas, translucent white panels, cobalt #1269ff actions. Violet and orange identify subjects only.
- Spacing: 14px outer inset, 17px card gaps, 18–24px card padding. Desktop sidebar 242px, main two-column grid 1.81:1.
- Materials: white translucent borders, 19px panel corners, soft glass highlights. Blue orbital banner is independently generated, never cropped from the supplied screenshot. Review cards are native CSS geometry.
- Layout: toolbar, greeting, four metrics, journey/chart, plan/review, subjects/next step. At tablet compact columns; below 600px single column and two-column metrics. Existing mobile navigation retained.
- Components: actual saved tasks, subjects, review counts and focus records. Empty, loading, unavailable, blocked and failed save states must remain truthful. Charts use Monday–Sunday in the plan timezone; no invented data or goal.
- Motion: subtle control transitions only, reduced-motion disables transitions. Visible keyboard focus, 44px action targets, labeled icon controls.
- Dark mode: navy glass panels with pale ink, preserving the same hierarchy and geometry.

## Shared Pro navigation

All entitled Pro routes use `pro-sidebar-unified` and `src/features/pro/pro-sidebar.css`, imported by Layout before route loading. Dashboard-specific styles must not own sidebar geometry or content. The sidebar, logo, menu spacing, profile card and active state remain the same when navigating or loading a non-dashboard URL directly.

- Expanded desktop: 242px above 1250px; 210px between 1024–1250px. Collapsed desktop: 84px. Mobile drawer: 270px.
- Outer shell: 14px inset and 32px gap (22px at narrower desktop widths), no inset or gap on mobile. Shared original blue glass background.
- Sidebar: 22px corners, 49px minimum menu rows, 15px menu labels, 22px icons, profile footer on every Pro route. Dark mode uses navy glass and pale ink.
- Collapse remains a user preference across navigation; route changes never change it automatically. Free navigation keeps its existing styles.

## Motion and profile identity

Pro route content arrives in 240ms with an 8px movement; the sidebar remains mounted. Sidebar width uses a 260ms transition, controls respond in 160–180ms, and chart/progress updates ease into place in 350–450ms. Hover effects apply to fine pointers only. Reduced-motion disables route animations and control/sidebar transitions.

The four premium presets are visible on the Pro profile and in its avatar picker. Profile, Dashboard and shared navigation resolve the same selected avatar using verified membership. Custom uploaded photos are preserved; preset choices retain their index when changing plans. Decorative spheres must not replace the user's profile image.

## Server-confirmed saves

New account writes go directly to Firestore through the compatibility `writeDocWithQueue` API. They succeed only after server acknowledgement, reject when offline or when the server fails, and never create a new browser pending-operation entry. User profile previews update after acknowledgement. Internal SyncRecovery panels are not rendered in user pages. Existing legacy pending records are preserved and retried in the background on reconnect, visibility changes and a 30-second interval. Cache and unsaved editor drafts are not server confirmation.

## Page-to-page transitions

Navigation prepares the destination component code before changing the displayed page. Supported browsers snapshot only the main page into a 340ms enter and 160ms exit transition; the sidebar stays mounted. Fast repeated navigation commits only the latest destination. Hash links and browser Back use the same navigation path. Reduced motion switches pages immediately, and older browsers retain the lightweight content entrance. No account data or rendered pages are cached by page preparation; failed module preparation remains retryable through the route boundary.

## Pro Flashcards

The entitled Flashcards workspace follows the Dashboard glass palette in `src/features/flashcards/glass-flashcards.css`; Free Flashcards keeps its own system. The shared navigation remains unchanged. Display library card count, due count, and completed sessions from actual saved data.

Desktop uses a 235px deck library and a flexible study panel. The panel includes subject/title, real card statistics, a blue two-sided preview and seven study modes. Optional metadata follows the primary study controls. Below 1280px the library becomes a collapsible full-width panel; below 600px the preview, modes and actions stack vertically. Mode buttons must reset legacy flex basis to avoid tall tablet controls.

Preview flips use a 550ms 3D transition, with distinct front/back faces and the active question or answer exposed as the button's accessible description. Reduced motion disables the transition. The full study portal uses a pale-blue glass canvas (navy in dark mode), readable white/navy cards, and existing grading, hint, keyboard, resume and save controls. Deck forms and the card editor inherit the glass colors without changing storage or study rules.

Flashcards main shell uses the same large 26px rounded liquid-glass panel as the other Pro tools: 23% white surface, translucent white border, 18px backdrop blur, and a navy treatment in dark mode. Mobile keeps the full-width panel without desktop corners.

## Free Profile

The approved Free Profile concept governs `free-profile.css`: an identity card and small Plans link on the left, with Personal details, Preferences and Connections tabs on the right. Retain the actual logo, available Free avatars, uploaded images, shared sidebar and bottom-right Saidamin. White matte 14px panels, cobalt actions and navy typography inherit the Free system. Notifications retain the actual study reminder, daily streak summary and AI source preview settings; do not replace them with unsupported concept labels.

Details exposes the existing name, read-only sign-in email, academic status and daily target. Edit, Cancel and Save preserve server confirmation; reject empty names and daily targets outside 5–480 minutes. Avatar presets and uploads update the shared profile only after server acknowledgement. Preferences uses the shared locale and Free shell theme state. Connections retains actual Telegram linking, disconnect/test actions and supported password-reset controls. No real message or password email is sent merely by viewing the page. Narrow layouts stack identity before settings, dark mode uses opaque navy panels, and reduced-motion disables decorative transitions.

## Free Plans

Free Pricing uses the compact variant of ProDiscovery with `free-plans.css`. Put Monthly/Yearly selection and Free/PRO comparison first, followed by the trial explanation and existing FAQs. Use white matte Free panels, a pale-blue PRO panel, cobalt actions and savings indicator, 14px corners and the shared large rounded shell. Preserve actual feature descriptions, configured prices, trial eligibility, payment availability, membership errors and purchase handlers. Yearly savings derive from twelve monthly payments minus the configured annual price. Viewing the page does not initiate a trial or payment.

Keep the original discovery hero, illustrative previews and long benefits presentation available in the noncompact variant. Compact Free uses the existing logo, sidebar and bottom-right Saidamin. Cards stack on phones; trial steps also stack, and controls retain visible focus. Dark mode uses opaque navy panels. Reduced motion disables cosmetic transitions. FAQ and payment options remain keyboard-accessible expandable sections.

## Free Progress

The approved Free Progress image governs `free-progress.css` and FreeAnalytics: a compact title with Week/Month selection, one four-metric strip, a study-duration chart beside the period goal, then a 35-day consistency grid and recent activity. The final next-session row opens Planner. Matte white 14px panels, cobalt actions, navy ink and thin blue-gray borders inherit the existing Free system and large rounded shell. Preserve the shared sidebar and bottom-right Saidamin launcher; Pro keeps its own presentation.

Reuse verified study evidence and account metrics. Period boundaries and session dates use Asia/Tashkent. Goal duration comes from the saved daily target multiplied by the actual period length; tasks are explicitly all-time and review coverage remains unavailable until measured. No sample image values are seeded. Loading and failed sources show placeholders and retry. The heatmap contains five complete Monday–Sunday rows including the current week, with future days dashed. Recent activity shows actual session subjects, timestamps and durations. Narrow layouts stack panels, keep all controls accessible and avoid horizontal page overflow. Dark mode uses opaque navy surfaces, and reduced-motion disables decorative transitions.

## Free Community

The approved Free Community image governs `free-community.css`: a compact heading and Invite/Create actions, followed by My groups, Discover groups and Friends navigation. Desktop places a 225px group library beside the flexible conversation and a 245px social rail. Use matte white 14px panels, cobalt actions, navy typography and thin blue-gray borders inside the shared rounded shell. Preserve the existing logo, sidebar and bottom-right Saidamin position; Pro keeps its independent glass styles.

My groups and Discover switch the left panel without discarding the selected conversation. Friends exposes the social panels. Invite focuses the existing email field; Create opens and focuses the existing group form. Empty states contain no invented people, messages or group counts. Existing membership, messaging, invitations, presence errors, loading and retry behavior remain authoritative. Below 1250px the social rail moves below the chat; below 700px all columns stack. Navy opaque surfaces support dark mode; reduced motion disables cosmetic transitions. Keep the internally scrolling message region, readable incoming/outgoing bubbles and accessible form controls.

## Free Flashcards

The approved Free Flashcards image governs `free-flashcards.css`: a 34px heading, Backup/Create deck actions, one joined three-metric strip and a 265px library beside the flexible deck workspace. Empty accounts show native stacked-card geometry, a first-deck action, import entry, three concise learning steps and a soft blue habit strip. Keep the shared rounded shell, compact sidebar, actual logo and bottom-right Saidamin launcher. White matte panels use 14px corners, thin blue-gray borders, navy text and cobalt actions; dark mode uses opaque navy surfaces.

Counts and accuracy derive from actual cards, due reviews and completed session attempts. Search and filters distinguish no matching results from a new library. Import first asks for a deck name, then opens the existing editor import tool; CSV/TSV/JSON/text parsing and existing save/study behavior remain authoritative. Existing deck management, seven study modes, review scheduling, resume and errors remain available. Below 900px the library stacks above the workspace; phones stack empty-state actions and guidance, with no horizontal page overflow. Reduced motion disables cosmetic transitions. Pro Flashcards keeps its separate design.

## Free Focus

Free Focus uses the established matte white and cobalt system, inside the shared 32px rounded shell. A compact page heading precedes a dominant timer card and a right rail containing today's task, a joined three-metric strip, daily goal and four ambient sound controls. Cards have 14px corners, thin blue-gray borders and no glass blur. The timer uses a thin progress ring, readable navy digits and a solid blue primary action. Selected timer modes expose their pressed state. Preserve existing session verification, errors, task editing and audio behavior; figures come from actual account/session data.

Below 1100px the cards stack; phone controls retain visible labels and accessible focus rings without horizontal page overflow. Dark mode uses navy surfaces with pale text. Reduced-motion preferences disable decorative transitions. The shared sidebar and bottom-right Saidamin launcher retain their placement.

## Pro Community

Community follows the shared liquid-glass shell and navigation through `src/features/community/community-glass.css`. The desktop workspace places groups on the left, the conversation in the center, and friends and invitations on the right. Narrow desktop and tablet layouts move the social panels below the conversation. Mobile uses horizontally scrolling group choices followed by the conversation, discovery and social panels.

The approved Community image concept governs the messenger layout: a 38px title, compact My groups/Discover navigation with a Create group action, pale-blue selected rooms, generous chat bubbles, round send control and a contextual members/invite/friends rail. The tabs switch the left library between joined groups and discovery without discarding the active conversation or draft. The right rail uses actual directory members with initials and measured presence; unavailable data retains retry states. No sample portraits, biographies or conversations from the concept are inserted into accounts. The shared sidebar and bottom-right Saidamin launcher retain their existing identity and placement. At narrow widths the rail moves below the chat, with no horizontal page overflow.

Counts come from saved groups, friends and invitations; loading or unavailable values display a dash. Existing membership, messaging, presence and invitation rules remain authoritative. Messages use readable translucent incoming bubbles and cobalt outgoing bubbles, with an internally scrolling conversation. Member dialogs inherit light and navy glass treatments. The Tutor launcher retains its shared bottom-right position. The page title is Community in every locale. Keyboard focus, mobile action targets and reduced-motion behavior follow the shared system.
