const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), "utf8");

test("landing does not ship or request the legacy 56 MB background video", () => {
  const landing = read("src/pages/Landing.tsx");
  const legacyVideo = path.join(
    projectRoot,
    "public",
    "noviq-landing-background.mp4",
  );

  assert.equal(landing.includes("noviq-landing-background.mp4"), false);
  assert.equal(fs.existsSync(legacyVideo), false);
  assert.match(landing, /landing-backdrop/);
});

test("app shell avoids layout and blur based route transitions", () => {
  const layout = read("src/components/Layout.tsx");

  assert.equal(layout.includes("transition-[width,transform]"), false);
  assert.equal(layout.includes("filter: 'blur"), false);
  assert.match(layout, /transition-transform duration-200/);
  assert.match(layout, /AnimatePresence mode="wait" initial=\{false\}/);
  assert.match(layout, /duration: 0\.14/);
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
  assert.match(shell, /aria-label=\{t\("shell\.language"\)\}/);
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

test("Flashcards pairs light and dark surfaces and traps modal focus", () => {
  const flashcards = read("src/pages/Flashcards.tsx");

  assert.match(flashcards, /useDialogFocus\(showDeckModal/);
  assert.match(flashcards, /useDialogFocus\(practiceOpen/);
  assert.match(flashcards, /aria-labelledby="create-deck-title"/);
  assert.match(flashcards, /border-slate-200 bg-white dark:border-white\/10/);
  assert.match(flashcards, /text-slate-950 dark:text-white/);
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

test("Pricing uses localized paired surfaces and explicit selection states", () => {
  const pricing = read("src/pages/Pricing.tsx");
  const copy = read("src/features/pricing/pricingCopy.ts");

  assert.match(pricing, /getPricingCopy\(locale\)/);
  assert.match(pricing, /aria-pressed=\{billingCycle === cycle\}/);
  assert.match(pricing, /aria-pressed=\{provider === method\.id\}/);
  assert.match(pricing, /aria-busy=\{isCheckingOut\}/);
  assert.match(pricing, /bg-white.*dark:bg-slate-900/);
  assert.equal(pricing.includes("#3F7D58"), false);
  assert.match(copy, /Fokusli o‘qish uchun sodda tariflar/);
  assert.match(copy, /Простые тарифы для сосредоточенной учёбы/);
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

  assert.ok(notebook.split(/\r?\n/).length <= 1000);
  assert.match(notebook, /<NotebookSourceDialog/);
  assert.match(notebook, /<NotebookAiPanel/);
  assert.equal(notebook.includes("const buildNotebookContext ="), false);
  assert.match(model, /export const buildNotebookContext/);
  assert.match(sourceDialog, /createPortal/);
  assert.match(aiPanel, /const QUICK_ACTIONS/);
});
