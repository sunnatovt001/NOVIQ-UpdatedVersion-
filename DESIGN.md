# NOVIQ Pro dashboard

The user-provided blue glass reference is the visual authority for the entitled dashboard only. Existing foundation standards in design-system/noviq/MASTER.md continue to govern Free and other surfaces.

## Pro Progress

The approved second Progress concept governs `GlassProgress.tsx` and `glass-progress.css`: a 40px heading, Week/Month control, wide primary study-duration panel, streak and all-time completed-task counts, then a 1.65:1 daily bar chart/consistency grid and a recent-session/next-step row. The shared sidebar, account avatar and bottom-right Saidamin launcher remain unchanged. Pale-blue glass surfaces, cobalt actions, navy typography and 20px panel corners inherit the Pro identity; dark mode uses navy panels and pale ink.

Week and month use Asia/Tashkent calendar boundaries. Targets derive from the saved daily target and the actual number of days in the selected period. Session totals, durations, heatmap intensity and the three most recent sessions come from existing study evidence. The heatmap contains exactly 35 dates aligned Monday–Sunday across five calendar weeks including the current week; future dates have dashed outlines. Tasks are explicitly labeled all-time, without an invented denominator. Existing metrics failures remain visible with retry, and unavailable values show a dash. Empty history remains truthful. Tablet condenses spacing; mobile stacks the panels and keeps controls usable without horizontal overflow. Reduced motion disables chart and control transitions. The image's sample records and values are never seeded into accounts.

## Pro Profile

The approved Profile concept governs the Pro-scoped `glass-profile.css`. A 38px heading leads into a roughly 1:2 identity/settings layout. The left panel shows the actual selected photo, four existing premium presets, photo upload and membership link. The right side uses Personal details, Preferences and Security controls. Personal details retains the existing name, sign-in email, academic status and daily-target fields; the concept's placeholder username and unsupported learning-goal options are not invented. Editing and avatar saves retain server acknowledgement and error feedback. Upload limits remain the existing 8 MB.

Language uses the shared locale context. Light/dark controls update the shared Pro shell theme, including the existing header control. Notifications retain the three actual saved preference types. Security shows available sign-in provider information and the Telegram connection controls; password accounts may explicitly request a reset email. No email is sent merely by viewing this tab. Missing provider metadata does not block rendering. Desktop uses pale glass surfaces, 20px panel corners, cobalt controls and a circular avatar; navy glass supports dark mode. Tablet condenses fields, and mobile stacks identity before settings with no horizontal overflow. The shared sidebar and bottom-right assistant remain unchanged; reduced motion disables cosmetic transitions.

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

## Pro Community

Community follows the shared liquid-glass shell and navigation through `src/features/community/community-glass.css`. The desktop workspace places groups on the left, the conversation in the center, and friends and invitations on the right. Narrow desktop and tablet layouts move the social panels below the conversation. Mobile uses horizontally scrolling group choices followed by the conversation, discovery and social panels.

The approved Community image concept governs the messenger layout: a 38px title, compact My groups/Discover navigation with a Create group action, pale-blue selected rooms, generous chat bubbles, round send control and a contextual members/invite/friends rail. The tabs switch the left library between joined groups and discovery without discarding the active conversation or draft. The right rail uses actual directory members with initials and measured presence; unavailable data retains retry states. No sample portraits, biographies or conversations from the concept are inserted into accounts. The shared sidebar and bottom-right Saidamin launcher retain their existing identity and placement. At narrow widths the rail moves below the chat, with no horizontal page overflow.

Counts come from saved groups, friends and invitations; loading or unavailable values display a dash. Existing membership, messaging, presence and invitation rules remain authoritative. Messages use readable translucent incoming bubbles and cobalt outgoing bubbles, with an internally scrolling conversation. Member dialogs inherit light and navy glass treatments. The Tutor launcher retains its shared bottom-right position. The page title is Community in every locale. Keyboard focus, mobile action targets and reduced-motion behavior follow the shared system.
