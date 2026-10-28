const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), "utf8");

test("Firebase auth boundary avoids database and other service imports", () => {
  const auth = read("src/lib/firebaseAuth.ts");
  assert.match(auth, /from "firebase\/auth"/);
  assert.doesNotMatch(auth, /firebase\/firestore|firebase\/functions|firebase\/storage|from "\.\/firebase"/);
  assert.match(read("src/lib/firebase.ts"), /export \* from "\.\/firebaseAuth"/);
  assert.match(read("src/lib/firebaseApp.ts"), /initializeApp\(firebaseConfig\)/);
});

test("Planner completion dialog wires modular surfaces and keyboard helpers", () => {
  const dialog = read("src/features/planner/PlannerCompletionDialog.tsx");
  assert.match(read("src/pages/Planner.tsx"), /<PlannerCompletionDialog celebration=\{celebration\}/);
  for (const expected of ['createPortal', 'useDialogFocus(true, panel, onClose)', 'useBodyScrollLock(true)', 'role="dialog"', 'aria-modal="true"', 'var(--noviq-card)', 'var(--noviq-text)']) assert.ok(dialog.includes(expected), expected);
  assert.doesNotMatch(dialog, /motion\/react|bg-white|text-\[#/);
});

test("Landing avoids backdrop blur and blurred hover glows", () => {
  const landing = read("src/pages/Landing.tsx");
  assert.doesNotMatch(landing, /backdrop-blur|blur-2xl|group-hover:scale-125|<motion\.article/);
  assert.doesNotMatch(landing, /motion\/react|AnimatePresence|<motion\./);
});

test("Planner task icons do not load a motion runtime or wait for outgoing animations", () => {
  const planner = read("src/pages/Planner.tsx");
  assert.doesNotMatch(planner, /motion\/react|AnimatePresence|<motion\./);
  assert.ok(planner.includes('complete ? <CheckCircle2 size={22} /> : <Icon size={22} />'));
});

test("onboarding avoids artificial delays and respects reduced motion", () => {
  const source = read("src/components/Onboarding.tsx");
  assert.doesNotMatch(source, /setTimeout|blur\(8px\)/);
  assert.match(source, /useReducedMotion\(\)/);
  assert.match(source, /duration: reduceMotion \? 0 : 0\.18/);
  assert.match(source, /heading\.current\?\.focus\(\)/);
  assert.match(source, /if \(lock\.current \|\| !selected\) return/);
  assert.match(source, /role="alert"/);
});

test("initial app loading uses semantic colors and no continuous or fake progress animation", () => {
  const loading = read("src/features/auth/AppLoadingScreen.tsx");
  const app = read("src/App.tsx");
  assert.match(loading, /role="status"/);
  assert.match(loading, /var\(--noviq-bg\)/);
  assert.match(loading, /noviq-theme/);
  assert.doesNotMatch(loading, /motion\/react|animate=|repeat:|progressbar/);
  assert.doesNotMatch(app, /motion\/react|AnimatePresence/);
  assert.match(app, /<AppLoadingScreen message=\{copy\.profileLoading\}/);
});

test("development watcher excludes reports without ignoring application source", () => {
  const config = read("vite.config.ts");
  const ignored = config.match(/watch:\s*\{\s*ignored:\s*\[([^\]]+)\]/)?.[1];
  assert.ok(ignored);
  for (const target of ['artifacts/**', 'backups/**', 'design-system/**', 'PRODUCTION_AUDIT.md', 'FOUNDATION_REDESIGN_STATUS.md']) {
    assert.ok(ignored.includes(`**/${target}`), target);
  }
  assert.equal(ignored.includes('src'), false);
  assert.equal(ignored.includes('**/*.ts'), false);
});

test("landing does not ship or request the legacy 56 MB background video", () => {
  const landing = read("src/pages/Landing.tsx");
  const legacyVideo = path.join(
    projectRoot,
    "public",
    "noviq-landing-background.mp4",
  );

  assert.equal(landing.includes("noviq-landing-background.mp4"), false);
  assert.equal(fs.existsSync(legacyVideo), false);
  assert.match(landing, /LandingStudents/);
  const brain = read("src/features/landing/LandingStudents.tsx");
  assert.match(brain, /IntersectionObserver/);
  assert.match(brain, /prefers-reduced-motion/);
  assert.doesNotMatch(brain, /<video|noviq-brain/);
  assert.ok(fs.statSync(path.join(projectRoot, "public", "landing", "noviq-students.webp")).size < 200 * 1024);
});

test("app shell avoids layout and blur based route transitions", () => {
  const layout = read("src/components/Layout.tsx");

  assert.equal(layout.includes("transition-[width,transform]"), false);
  assert.equal(layout.includes("filter: 'blur"), false);
  assert.match(layout, /transition-transform duration-200/);
  assert.equal(layout.includes('AnimatePresence mode="wait"'), false);
  assert.match(layout, /<div data-route-content/);
});

test("global styles provide a reduced-motion fallback", () => {
  const stylesheet = read("src/index.css");

  assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(stylesheet, /transition-duration: 0\.01ms !important/);
});

test("Today dashboard stays modular and avoids the retired journal listener", () => {
  const dashboard = read("src/pages/Dashboard.tsx");
  const todayView = read("src/components/Dashboard/TodayDashboardView.tsx");
  const snapshotCount = (dashboard.match(/onSnapshot\s*\(/g) || []).length;

  assert.ok(dashboard.split(/\r?\n/).length <= 600);
  assert.equal(snapshotCount, 4);
  assert.equal(dashboard.includes('collection(db, "users", user.uid, "journals")'), false);
  assert.match(dashboard, /<TodayDashboardView/);
  assert.match(todayView, /today\.nextAction/);
});

test("Planner keeps domain logic outside the React page", () => {
  const planner = read("src/pages/Planner.tsx");
  const engine = read("src/features/planner/plannerEngine.ts");
  const config = read("src/features/planner/plannerConfig.ts");
  const types = read("src/features/planner/plannerTypes.ts");
  const settings = read("src/features/planner/PlannerSettingsDialog.tsx");
  const copy = read("src/features/planner/plannerCopy.ts");

  assert.ok(planner.split(/\r?\n/).length <= 2050);
  assert.match(planner, /from "@\/src\/features\/planner\/plannerEngine"/);
  assert.match(planner, /<PlannerSettingsDialog/);
  assert.equal(planner.includes("const buildTodayMission ="), false);
  assert.match(engine, /export const buildTodayMission/);
  assert.match(engine, /export const normalizePlannerState/);
  assert.match(config, /export const EXAM_OPTIONS/);
  assert.match(types, /export type PlannerState/);
  assert.match(settings, /inputMode="numeric"/);
  assert.match(settings, /planner\.sectionScores/);
  assert.match(planner, /localizeRoadmapPhases/);
  assert.match(copy, /localizePlannerTaskLabel/);
  assert.match(copy, /Bugungi vazifa/);
  assert.match(copy, /Задача на сегодня/);
  assert.equal(planner.includes("�"), false);
});

test("Tutor keeps file processing modular and defaults to clean English copy", () => {
  const tutor = read("src/pages/Tutor.tsx");
  const attachments = read("src/features/tutor/tutorAttachments.ts");
  const copy = read("src/features/tutor/tutorCopy.ts");

  assert.ok(tutor.split(/\r?\n/).length <= 625);
  assert.match(tutor, /fileToTutorAttachment/);
  assert.equal(tutor.includes("const readAsDataUrl"), false);
  assert.match(tutor, /locale === "uz" \? "uz-UZ"/);
  assert.match(attachments, /await import\("mammoth"\)/);
  assert.match(copy, /Здравствуйте!/);
  assert.equal(copy.includes("Р—Р"), false);
});

test("application locale defaults to English and persists explicit choices", () => {
  const locale = read("src/contexts/LocaleContext.tsx");
  const shell = read("src/components/Layout.tsx");

  assert.match(locale, /return "en"/);
  assert.match(locale, /noviq-locale/);
  assert.match(locale, /document\.documentElement\.lang = locale/);
  assert.match(shell, /<HeaderLanguagePicker/);
  const picker = read("src/components/SidebarLanguagePicker.tsx");
  assert.match(picker, /<legend className="sr-only">\{t\("shell\.language"\)\}/);
  assert.match(picker, /type="radio"/);
  assert.match(picker, /setLocale\(option\.value\)/);
  assert.match(shell, /t\("nav\.library"\)/);
});

test("Focus stays idle until requested and supports narrow localized controls", () => {
  const focus = read("src/pages/Focus.tsx");
  const copy = read("src/features/focus/focusCopy.ts");

  assert.match(focus, /useState<string \| null>\(null\)/);
  assert.equal(focus.includes('useState<string | null>("focus-beats")'), false);
  assert.match(focus, /window\.setInterval/);
  assert.match(focus, /\}, \[isActive\]\);/);
  assert.match(focus, /grid-cols-\[minmax\(0,1fr\)_minmax\(8\.5rem,1\.7fr\)_minmax\(0,1fr\)\]/);
  assert.match(copy, /Fokus hududi/);
  assert.match(copy, /Зона фокуса/);
});

test("Flashcards pairs light and dark surfaces and traps both portal dialogs", () => {
  const page = read("src/pages/Flashcards.tsx");
  const study = read("src/features/flashcards/Study.tsx");
  const css = read("src/features/flashcards/flashcards.css");
  assert.match(page, /useDialogFocus\(create/);
  assert.match(study, /useDialogFocus\(true/);
  assert.match(page, /aria-labelledby="new-deck-title"/);
  assert.match(study, /aria-modal="true"/);
  assert.match(css, /\.dark \.fc-workspace/);
  assert.match(css, /prefers-reduced-motion/);
});

test("Analytics uses localized copy and paired chart surfaces", () => {
  const analytics = read("src/pages/Analytics.tsx");
  const copy = read("src/features/analytics/analyticsCopy.ts");

  assert.match(analytics, /getAnalyticsCopy\(locale\)/);
  assert.match(analytics, /stroke="var\(--noviq-border\)"/);
  assert.match(analytics, /bg-white.*dark:bg-slate-900/);
  assert.equal(analytics.includes("text-purple-400"), false);
  assert.equal(analytics.includes("text-pink-400"), false);
  assert.match(copy, /O‘qish tahlili/);
  assert.match(copy, /Аналитика обучения/);
});

test("Profile uses localized paired surfaces and an accessible avatar dialog", () => {
  const profile = read("src/pages/Profile.tsx");
  const copy = read("src/features/profile/profileCopy.ts");

  assert.match(profile, /useDialogFocus\(showAvatarModal/);
  assert.match(profile, /createPortal/);
  assert.match(profile, /aria-labelledby="avatar-editor-title"/);
  assert.match(profile, /bg-white.*dark:bg-slate-900/);
  assert.equal(profile.includes("bg-purple-600"), false);
  assert.match(copy, /Hisob, o‘qish sozlamalari/);
  assert.match(copy, /Управляйте аккаунтом/);
});

test("PRO membership uses the existing pricing route, localized copy and accessible selection states",()=>{
 const route=read('src/pages/Pricing.tsx'),page=read('src/features/pro/ProMembership.tsx'),copy=read('src/features/pro/proCopy.ts');
 assert.match(route,/ProMembership/);assert.match(page,/useProCopy/);assert.match(page,/aria-pressed=\{cycle\s*===\s*v\}/);assert.match(page,/select value=\{provider\}/);assert.match(page,/disabled=\{checkoutBusy\s*\|\|\s*promoBusy\s*\|\|\s*\(!access.billing\?\.providersConfigured\s*&&\s*promo\?\.amount!==0\)\}/);assert.match(copy,/Sizning shaxsiy/);assert.match(copy,/Ваш персональный/);assert.match(page,/config.prices\[cycle\]/);
});

test("Community separates its member dialog and localizes the social workspace", () => {
  const community = read("src/pages/Community.tsx");
  const dialog = read("src/features/community/CommunityMembersDialog.tsx");
  const copy = read("src/features/community/communityCopy.ts");

  assert.match(community, /getCommunityCopy\(locale\)/);
  assert.match(community, /<CommunityMembersDialog/);
  assert.equal(community.includes("createPortal"), false);
  assert.match(dialog, /useDialogFocus\(true, panel, onClose\)/);
  assert.match(dialog, /aria-labelledby="group-members-heading"/);
  assert.match(copy, /Do‘stlaringiz bilan birga o‘qing/);
  assert.match(copy, /Учитесь вместе, делитесь идеями/);
});

test("Notebook separates its data model, source dialog and AI workspace", () => {
  const notebook = read("src/pages/Notes.tsx");
  const model = read("src/features/notebook/notebookModel.ts");
  const sourceDialog = read(
    "src/features/notebook/NotebookSourceDialog.tsx",
  );
  const aiPanel = read("src/features/notebook/NotebookAiPanel.tsx");

  assert.ok(notebook.split(/\r?\n/).length <= 1100);
  assert.match(notebook, /useNotebookDraft/);
  assert.match(read('src/features/pro/useNotebookDraft.ts'), /loadLocalDataStrict/);
  assert.match(notebook, /<NotebookSourceDialog/);
  assert.match(notebook, /<NotebookAiPanel/);
  assert.equal(notebook.includes("const buildNotebookContext ="), false);
  assert.match(model, /export const buildNotebookContext/);
  assert.match(sourceDialog, /createPortal/);
  assert.match(aiPanel, /const QUICK_ACTIONS/);
});
