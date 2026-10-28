import { ProgressionPanel } from '@/src/features/progression/ProgressionPanel';
import React from "react";
import {
  ArrowRight,
  BookOpen,
  Brain,
  Check,
  Circle,
  Clock3,
  Layers3,
  Search,
  Timer,
  CalendarDays,
  Compass,
  Sparkles,
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useLocale } from "@/src/contexts/LocaleContext";

export type TodayTask = {
  id: string;
  title: string;
  category: string;
  time: string;
  duration: number;
  status: "notStarted" | "inProgress" | "completed";
  done: boolean;
  source: "roadmap" | "planner";
};

type RhythmDay = { day: string; level: number; minutes?: number };

interface TodayDashboardViewProps {
  freeDesign?: boolean;
  firstName: string;
  tasks: TodayTask[];
  tasksLoading: boolean;
  tasksError: string;
  completedTaskCount: number;
  taskCompletionLabel: string;
  nextTask?: TodayTask;
  focusTimeLabel: string;
  focusTargetProgress: number;
  dailyTargetMinutes: number;
  notesCount: number;
  latestNotebookTitle: string;
  dueCardsLabel: string;
  weeklyRhythm: RhythmDay[];
  sessionsReady: boolean;
  commandQuery: string;
  statsUnavailable: boolean;
  recentUnavailable: boolean;
  onCommandChange: (value: string) => void;
  onRunCommand: () => void;
  onOpenTask: (task: TodayTask) => void;
  onNavigate: (tab: string) => void;
  onRetryStatistics: () => void;
  onRetryTasks: () => void;
  onRetryRecent: () => void;
}

const DATE_LOCALES = { en: "en-US", uz: "uz-UZ", ru: "ru-RU" } as const;
const WEEKDAY_LABELS = {
  en: ["M", "T", "W", "T", "F", "S", "S"],
  uz: ["Du", "Se", "Cho", "Pa", "Ju", "Sha", "Ya"],
  ru: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
} as const;

const formatToday = (locale: keyof typeof DATE_LOCALES) =>
  new Intl.DateTimeFormat(DATE_LOCALES[locale], {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

export const TodayDashboardView = ({
  freeDesign = false,
  firstName,
  tasks,
  tasksLoading,
  tasksError,
  completedTaskCount,
  taskCompletionLabel,
  nextTask,
  focusTimeLabel,
  focusTargetProgress,
  dailyTargetMinutes,
  notesCount,
  latestNotebookTitle,
  dueCardsLabel,
  weeklyRhythm,
  sessionsReady,
  commandQuery,
  statsUnavailable,
  recentUnavailable,
  onCommandChange,
  onRunCommand,
  onOpenTask,
  onNavigate,
  onRetryStatistics,
  onRetryTasks,
  onRetryRecent,
}: TodayDashboardViewProps) => {
  const { locale, t } = useLocale();
  const visibleTasks = tasks.slice(0, 4);
  const words=locale==='uz'?{next:'Keyingi qadamingiz shu yerdan boshlanadi',empty:'Aniq kun kichik rejadan boshlanadi.',saved:'Saqlangan vazifalaringiz shu yerda ko‘rinadi.',focus:'Fokus mashg‘ulotini boshlash',explore:'O‘qish maydoningiz imkoniyatlarini kengaytiring.',compare:'Rejalarni solishtirish',none:'Hali fokus mashg‘uloti qayd etilmagan.'}:locale==='ru'?{next:'Ваш следующий шаг начинается здесь',empty:'Ясный день начинается с небольшого плана.',saved:'Здесь появятся сохранённые задачи.',focus:'Начать фокус-сессию',explore:'Откройте больше возможностей для учёбы.',compare:'Сравнить планы',none:'Фокус-сессий пока нет.'}:{next:'Your next step starts here',empty:'A clear day starts with a small plan.',saved:'Your saved tasks will appear here.',focus:'Start a focus session',explore:'Explore a more connected study workspace.',compare:'Compare plans',none:'No focus sessions recorded yet.'};

  return (
    <div className={cn(freeDesign && 'free-today',"today-shell mx-auto w-full max-w-[1280px] space-y-5 pb-8 sm:space-y-6")}>
      <header className="flex flex-col gap-4 px-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--noviq-muted)]">{formatToday(locale)}</p>
          <h1 className="mt-1 text-balance font-display text-3xl font-bold tracking-[-0.04em] text-[var(--noviq-text)] sm:text-4xl">
            {t("today.greeting", { name: firstName })}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--noviq-muted)] sm:text-base">
            {t("today.intro")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate("planner")}
          className="today-secondary-button inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl px-4 text-sm font-semibold"
        >
          {t("today.adjustPlan")}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </header>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onRunCommand();
        }}
        className="today-command flex items-center gap-3 rounded-2xl px-4 py-3"
      >
        <Search size={19} className="shrink-0 text-[var(--noviq-muted)]" aria-hidden="true" />
        <label htmlFor="today-command" className="sr-only">{t("today.commandLabel")}</label>
        <input
          id="today-command"
          name="today-command"
          value={commandQuery}
          onChange={(event) => onCommandChange(event.target.value)}
          placeholder={t("today.commandPlaceholder")}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent py-1 text-base text-[var(--noviq-text)] outline-none placeholder:text-[var(--noviq-muted)]"
        />
        <button
          type="submit"
          className="today-primary-button hidden min-h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold sm:inline-flex"
        >
          {t("today.go")}
        </button>
      </form>

      {(statsUnavailable || tasksError || recentUnavailable) && (
        <div className="grid gap-2" aria-label={t("today.recoveryActions")}>
          {statsUnavailable && (
            <div role="alert" className="today-alert">
              <span>{t("today.statsUnavailable")}</span>
              <button type="button" onClick={onRetryStatistics}>{t("today.retryStats")}</button>
            </div>
          )}
          {tasksError && (
            <div role="alert" className="today-alert">
              <span>{tasksError}</span>
              <button type="button" onClick={onRetryTasks}>{t("today.retryMission")}</button>
            </div>
          )}
          {recentUnavailable && (
            <div role="alert" className="today-alert">
              <span>{t("today.recentUnavailable")}</span>
              <button type="button" onClick={onRetryRecent}>{t("today.retryRecent")}</button>
            </div>
          )}
        </div>
      )}

      <ProgressionPanel />
      <div className="ft-grid grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.75fr)]">
        <div className="space-y-5">
          <section className="today-next-card overflow-hidden rounded-[1.75rem] p-6 sm:p-8">
            {freeDesign&&<Compass className="ft-compass" size={46} aria-hidden="true"/>}
            <div className="flex flex-col gap-7 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#2148C7] dark:text-[#AFC3FF]">
                  <span className="h-2 w-2 rounded-full bg-[#315EFB]" />
                  {t("today.nextAction")}
                </div>
                {nextTask ? (
                  <>
                    <h2 className="mt-4 max-w-2xl text-pretty font-display text-3xl font-bold tracking-[-0.04em] text-[var(--noviq-text)] sm:text-4xl">
                      {nextTask.title}
                    </h2>
                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[var(--noviq-muted)]">
                      <span>{nextTask.category}</span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 size={15} aria-hidden="true" />
                        {nextTask.time || `${nextTask.duration} min`}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="mt-4 font-display text-3xl font-bold tracking-[-0.04em] text-[var(--noviq-text)]">
                      {freeDesign ? words.next : t("today.noMission")}
                    </h2>
                    <p className="mt-3 max-w-lg text-sm leading-6 text-[var(--noviq-muted)]">
                      {t("today.buildPlan")}
                    </p>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => nextTask ? onOpenTask(nextTask) : onNavigate("planner")}
                className="today-primary-button inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold"
              >
                {nextTask ? t("today.startNext") : t("today.createPlan")}
                <ArrowRight size={17} aria-hidden="true" />
              </button>
            </div>
          </section>

          <section className="today-card rounded-[1.5rem] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-[var(--noviq-text)]">{t("today.planTitle")}</h2>
                <p className="mt-1 text-sm text-[var(--noviq-muted)]">{t("today.planSubtitle")}</p>
              </div>
              <span className="rounded-lg bg-[var(--noviq-soft)] px-3 py-1.5 text-sm font-semibold text-[var(--noviq-accent-hover)]">
                {freeDesign && !tasksLoading && !tasksError && tasks.length===0 ? (locale==='uz'?'0 vazifa':locale==='ru'?'0 задач':'0 tasks') : taskCompletionLabel}
              </span>
            </div>

            <div className="mt-5 divide-y divide-[var(--noviq-border)]">
              {tasksLoading && !visibleTasks.length ? (
                <p className="py-5 text-sm text-[var(--noviq-muted)]">{t("today.loadingPlan")}</p>
              ) : visibleTasks.length ? (
                visibleTasks.map((task) => (
                  <div key={`${task.source}-${task.id}`} className="flex items-center gap-3 py-4 first:pt-0 last:pb-0">
                    <span className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
                      task.done
                        ? "border-[#2E9D75] bg-[#E8F7F1] text-[#237A5C]"
                        : "border-[var(--noviq-border)] text-[var(--noviq-muted)]",
                    )}>
                      {task.done ? <Check size={16} aria-hidden="true" /> : <Circle size={13} aria-hidden="true" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn("truncate text-sm font-semibold text-[var(--noviq-text)]", task.done && "line-through opacity-60")}>
                        {task.title}
                      </p>
                      <p className="mt-1 truncate text-xs text-[var(--noviq-muted)]">{task.category} · {task.time}</p>
                    </div>
                    {!task.done && (
                      <button
                        type="button"
                        onClick={() => onOpenTask(task)}
                        className="min-h-10 rounded-xl px-3 text-sm font-semibold text-[#315EFB] hover:bg-[#E9EFFF] dark:text-[#AFC3FF] dark:hover:bg-white/5"
                      >
                        {task.source === "roadmap" ? t("today.start") : t("today.open")}
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <div className="ft-empty py-6 text-center">
                  {freeDesign&&<CalendarDays size={43} aria-hidden="true"/>}
                  <p className="text-sm font-semibold text-[var(--noviq-text)]">{freeDesign ? words.empty : t("today.noMission")}</p>
                  <p className="mt-1 text-sm text-[var(--noviq-muted)]">{freeDesign ? words.saved : t("today.createSteps")}</p>
                  {freeDesign&&<button type="button" className="today-secondary-button" onClick={()=>onNavigate('planner')}>{t('nav.planner')}<ArrowRight size={15}/></button>}
                </div>
              )}
            </div>

            {tasks.length > visibleTasks.length && (
              <button type="button" onClick={() => onNavigate("planner")} className="mt-5 text-sm font-semibold text-[#315EFB] dark:text-[#AFC3FF]">
                {t("today.viewAll", { count: tasks.length })}
              </button>
            )}
          </section>

          <section className="ft-week today-card rounded-[1.5rem] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-[var(--noviq-text)]">{t("today.thisWeek")}</h2>
                <p className="mt-1 text-sm text-[var(--noviq-muted)]">{t("today.weekSubtitle")}</p>
              </div>
              <button type="button" onClick={() => onNavigate("analytics")} className="text-sm font-semibold text-[#315EFB] dark:text-[#AFC3FF]">{t("today.viewProgress")}</button>
            </div>
            <div className="mt-6 grid grid-cols-7 gap-2 sm:gap-3">
              {weeklyRhythm.map((item, index) => (
                <div key={`${item.day}-${index}`} className="space-y-2 text-center">
                  <div className="flex h-20 items-end overflow-hidden rounded-xl bg-[var(--noviq-soft)] p-1.5 sm:h-24">
                    <div
                      className="w-full rounded-lg bg-[#315EFB] transition-[height] duration-200"
                      style={{ height: `${sessionsReady ? Math.min(100,item.level) : 0}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-[var(--noviq-muted)]">{WEEKDAY_LABELS[locale][index] || item.day}</span>
                </div>
              ))}
            </div>
            {freeDesign&&sessionsReady&&weeklyRhythm.every(day=>day.level===0)&&<p className="ft-week-empty">{words.none}</p>}
          </section>
        </div>

        <aside className="space-y-5">
          <section className="today-card rounded-[1.5rem] p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E9EFFF] text-[#315EFB] dark:bg-white/5 dark:text-[#AFC3FF]">
                <Timer size={19} aria-hidden="true" />
              </div>
              <span className="text-sm font-semibold text-[var(--noviq-muted)]">{focusTargetProgress}%</span>
            </div>
            <p className="mt-5 text-sm font-semibold text-[var(--noviq-muted)]">{t("today.focusSelected")}</p>
            <p className="mt-1 text-3xl font-bold tracking-[-0.04em] text-[var(--noviq-text)]">{focusTimeLabel}</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--noviq-soft)]">
              <div className="h-full rounded-full bg-[#315EFB]" style={{ width: `${focusTargetProgress}%` }} />
            </div>
            <p className="mt-3 text-xs text-[var(--noviq-muted)]">{t("today.dailyTarget", { count: dailyTargetMinutes })}</p>
            <p className="sr-only">{t("today.savedCompletion")}</p>
            {freeDesign&&<button type="button" className="today-primary-button ft-focus-start" onClick={()=>onNavigate('focus')}>{words.focus}<ArrowRight size={16}/></button>}
          </section>

          <section className="today-card rounded-[1.5rem] p-5 sm:p-6">
            <h2 className="text-lg font-bold text-[var(--noviq-text)]">{t("today.studyLibrary")}</h2>
            <button type="button" onClick={() => onNavigate("notes")} className="mt-4 flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-[var(--noviq-soft)]">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--noviq-soft)] text-[var(--noviq-accent-hover)]"><BookOpen size={18} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[var(--noviq-text)]">{t("today.notes", { count: notesCount })}</span>
                <span className="mt-0.5 block truncate text-xs text-[var(--noviq-muted)]">{latestNotebookTitle}</span>
              </span>
              <ArrowRight size={16} className="text-[var(--noviq-muted)]" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => onNavigate("flashcards")} className="mt-2 flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-[var(--noviq-soft)]">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--noviq-soft)] text-[var(--noviq-accent-hover)]"><Layers3 size={18} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[var(--noviq-text)]">{t("today.flashcards")}</span>
                <span className="mt-0.5 block text-xs text-[var(--noviq-muted)]">{dueCardsLabel}</span>
              </span>
              <ArrowRight size={16} className="text-[var(--noviq-muted)]" aria-hidden="true" />
            </button>
          </section>

          <section className="today-card rounded-[1.5rem] p-5 sm:p-6">
            <h2 className="text-lg font-bold text-[var(--noviq-text)]">{t("today.quickTools")}</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => onNavigate("tutor")} className="today-tool-button">
                <Brain size={19} aria-hidden="true" />
                {t("today.askTutor")}
              </button>
              <button type="button" onClick={() => onNavigate("notes")} className="today-tool-button">
                <BookOpen size={19} aria-hidden="true" />
                {t("today.addNote")}
              </button>
              {freeDesign&&<><button type="button" onClick={()=>onNavigate('planner')} className="today-tool-button"><CalendarDays size={19}/>{t('nav.planner')}</button><button type="button" onClick={()=>onNavigate('flashcards')} className="today-tool-button"><Layers3 size={19}/>{t('today.flashcards')}</button></>}
            </div>
          </section>

          <section className="today-card rounded-[1.5rem] p-5 sm:p-6">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-[var(--noviq-text)]">{t("today.tasksCompleted")}</span>
              <span className="font-bold text-[#2E9D75]">{completedTaskCount}/{tasks.length}</span>
            </div>
          </section>
        </aside>
      </div>
      {freeDesign&&<aside className="ft-upgrade"><Sparkles size={23}/><div><strong>{words.explore}</strong></div><button type="button" onClick={()=>onNavigate('pricing')}>{words.compare}<ArrowRight size={16}/></button></aside>}
    </div>
  );
};
