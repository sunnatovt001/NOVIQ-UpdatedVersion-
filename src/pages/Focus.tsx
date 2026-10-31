import { FocusLock } from '@/src/features/focus/FocusLock';
import { visitStreaks } from '@/src/lib/visitStreak';

import { FocusReflection } from '@/src/features/pro/FocusReflection';

import React from "react";

import { Play, Pause, RotateCcw, Brain, TimerReset, Coffee, Palmtree, Lightbulb, Target, Check, Clock3, Flame, Volume2, Leaf, SkipForward, Plus, Pencil, CheckCircle2 } from "lucide-react";
import { formatTime, cn } from "@/src/lib/utils";

import { formatFocusCopy } from "@/src/features/focus/focusCopy";

type FocusHistoryEntry = { id: string; duration: number; timestamp: string; origin?:'device'|'server'; status?:string };

import { useFocusController } from '@/src/features/focus/useFocusController';

export const Focus = () => {
  const { FOCUS_DURATION, SHORT_BREAK_DURATION, LONG_BREAK_DURATION, DAILY_GOAL, tracks, profile, study, locale, copy, time, isActive, mode, deepWork, music, setMusic, breakDuration, setBreakDuration, taskInputOpen, setTaskInputOpen, helpOpen, setHelpOpen, taskDraft, setTaskDraft, focusTask, taskDone, setTaskDone, audioRef, sessionBusy, sessionError, localOnly, verifying, xpReceipt, completeCurrentFocusSession, toggleTimer, resetTimer, selectTimerMode, updateFocusTask, skipTimer, completedToday, focusMinutes, progress, sessionNumber } = useFocusController();
  return (
    <div
      className={cn(
        "pro-focus-workspace min-h-[calc(100dvh-9rem)] rounded-[32px] border border-slate-200/90 bg-[#f8fbff] p-3 text-slate-900 shadow-[0_20px_70px_rgba(15,23,42,0.05)] sm:p-4 dark:border-slate-800 dark:bg-slate-950",
        deepWork && "dark:bg-black",
      )}
    >
      <audio ref={audioRef} loop /><FocusLock running={isActive} mode={mode} time={time} task={focusTask} locale={locale} busy={sessionBusy || verifying} error={sessionError} onToggle={toggleTimer} onFinish={completeCurrentFocusSession}/>
      {xpReceipt?.status === 'partial' && <p role="status" className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{locale==='uz'?'Sessiya oxirigacha tugamadi. XP berilmadi. Haqiqiy vaqt:':locale==='ru'?'Сессия не завершена. XP не начислены. Фактическое время:':'Session incomplete. No XP awarded. Actual time:'} {formatTime(xpReceipt.duration || 0)}</p>}
      {xpReceipt?.duration !== undefined && xpReceipt.recordedDuration !== undefined && xpReceipt.recordedDuration > xpReceipt.duration && <p role="status" className="mb-3 text-sm">{locale === 'uz' ? 'Qayd etilgan vaqt' : locale === 'ru' ? 'Записанное время' : 'Recorded time'}: {formatTime(xpReceipt.recordedDuration)} · {locale === 'uz' ? 'server tasdiqlagan' : locale === 'ru' ? 'подтверждено сервером' : 'server verified'}: {formatTime(xpReceipt.duration)}</p>}
      {study.error && <details className="quiet-sync"><summary>{locale==='uz'?'Faoliyat sinxronlashuvi':locale==='ru'?'Синхронизация активности':'Activity sync'}</summary><p>{locale==='uz'?'Serverga ulanish kutilmoqda. Qurilmadagi yozuvlar saqlangan.':locale==='ru'?'Ожидается подключение. Данные устройства сохранены.':'Waiting for a connection. Device records are saved.'}</p><button type="button" onClick={study.retry}>{locale==='uz'?'Yangilash':locale==='ru'?'Обновить':'Refresh'}</button></details>}
      <div className="mx-auto grid w-full max-w-none gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.9fr)]">
        <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5 lg:p-6">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10">
                <TimerReset size={31} />
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tight">
                  {copy.title}
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  {copy.subtitle}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-expanded={helpOpen}
              aria-controls="focus-help"
              onClick={() => setHelpOpen((current) => !current)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-500 dark:border-slate-700"
            >
              <Lightbulb size={16} /> {copy.howItWorks}
            </button>
          </header>
          {helpOpen && (
            <p
              id="focus-help"
              className="mt-4 rounded-2xl bg-blue-50 p-4 text-sm text-blue-900 dark:bg-blue-500/10 dark:text-blue-100"
            >
              {copy.help}
            </p>
          )}

          <div className="mt-7 grid grid-cols-3 rounded-2xl border border-slate-200 bg-slate-50 p-1.5 dark:border-slate-700 dark:bg-slate-800">
            {[
              {
                label: copy.focus,
                duration: FOCUS_DURATION,
                icon: TimerReset,
                active: mode === "focus",
                mode: "focus" as const,
              },
              {
                label: copy.shortBreak,
                duration: SHORT_BREAK_DURATION,
                icon: Coffee,
                active:
                  mode === "break" && breakDuration === SHORT_BREAK_DURATION,
                mode: "break" as const,
              },
              {
                label: copy.longBreak,
                duration: LONG_BREAK_DURATION,
                icon: Palmtree,
                active:
                  mode === "break" && breakDuration === LONG_BREAK_DURATION,
                mode: "break" as const,
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    if (item.duration !== FOCUS_DURATION)
                      setBreakDuration(item.duration);
                    selectTimerMode(item.mode, item.duration);
                  }}
                  className={cn(
                    "flex min-h-14 items-center justify-center gap-2 rounded-xl px-2 text-left transition",
                    item.active
                      ? "bg-blue-50 text-blue-600 shadow-sm dark:bg-blue-500/15"
                      : "text-slate-500 hover:bg-white dark:hover:bg-slate-700",
                  )}
                >
                  <Icon size={21} />
                  <span className="leading-tight">
                    <span className="block text-xs font-black">
                      {item.label}
                    </span>
                    <span className="block text-sm font-bold">
                      {formatFocusCopy(copy.minutes, { count: item.duration / 60 })}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {(verifying || localOnly || sessionError || sessionBusy) && (
            <div className="mt-4" aria-live="polite">
              {sessionError ? (
                <p
                  role="alert"
                  className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:bg-red-950/50 dark:text-red-200"
                >
                  {sessionError}
                </p>
              ) : (
                <p
                  role="status"
                  className="rounded-xl bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800 dark:bg-blue-950/50 dark:text-blue-200"
                >
                  {sessionBusy
                    ? copy.savingSession
                    : verifying
                      ? copy.connecting
                      : copy.deviceOnly}
                </p>
              )}
            </div>
          )}

          <div
            className="pro-focus-dial mx-auto mt-6 grid h-[clamp(270px,31vw,340px)] w-[clamp(270px,31vw,340px)] place-items-center rounded-full bg-[conic-gradient(var(--focus-ring)_0%,#e8eff9_var(--focus-ring)_100%)] p-3 shadow-[0_0_0_16px_rgba(37,99,235,0.05)]"
            style={{ "--focus-ring": `${progress}%` } as React.CSSProperties}
          >
            <svg className="liquid-timer-progress hidden" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" pathLength="100" strokeDasharray={`${progress} 100`}/></svg>
            <div className="grid h-full w-full place-items-center rounded-full bg-white text-center shadow-inner dark:bg-slate-900">
              <div>
                <Brain className="mx-auto text-blue-600" size={34} />
                <p className="mt-3 text-lg font-black">
                  {mode === "focus"
                    ? copy.focusSession
                    : breakDuration === LONG_BREAK_DURATION
                      ? copy.longBreak
                      : copy.shortBreak}
                </p>
                <p className="text-sm text-slate-500">
                  {mode === "focus" ? copy.pomodoroMode : copy.mindfulPause}
                </p>
                <button
                  type="button"
                  aria-label={isActive ? copy.pauseTimer : copy.startTimer}
                  disabled={sessionBusy}
                  onClick={toggleTimer}
                  className="mt-2 text-[clamp(4rem,9vw,6.5rem)] font-black leading-none tracking-[-0.08em] text-slate-900 transition hover:text-blue-600 disabled:opacity-50 dark:text-white"
                >
                  {formatTime(time)}
                </button>
                <p className="mx-auto mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <Leaf size={15} />{" "}
                  {isActive
                    ? copy.stayInFlow
                    : mode === "focus"
                      ? copy.timeToFocus
                      : copy.enjoyBreak}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-[minmax(0,1fr)_minmax(8.5rem,1.7fr)_minmax(0,1fr)] items-center gap-2 sm:flex sm:justify-center sm:gap-7">
            <button
              type="button"
              aria-label={copy.resetTimer}
              disabled={sessionBusy}
              onClick={resetTimer}
              className="inline-flex min-w-0 items-center justify-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-3 text-xs font-bold text-slate-500 transition hover:border-blue-300 hover:text-blue-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 sm:min-w-28 sm:gap-2 sm:px-5 sm:text-sm"
            >
              <RotateCcw size={18} /> <span className="hidden min-[350px]:inline">{copy.reset}</span>
            </button>
            <button
              type="button"
              aria-label={isActive ? copy.pauseTimer : copy.startTimer}
              disabled={sessionBusy}
              onClick={toggleTimer}
              className="inline-flex min-w-0 items-center justify-center gap-2 rounded-full bg-blue-600 px-3 py-4 text-base font-black text-white shadow-lg shadow-blue-500/25 transition hover:bg-blue-500 disabled:opacity-50 sm:min-w-48 sm:gap-3 sm:px-8 sm:text-lg"
            >
              {isActive ? (
                <Pause size={23} fill="currentColor" />
              ) : (
                <Play size={23} fill="currentColor" />
              )}{" "}
              {isActive ? copy.pause : copy.start}
            </button>
            <button
              type="button"
              aria-label={copy.skipTimer}
              disabled={sessionBusy || verifying}
              onClick={skipTimer}
              className="inline-flex min-w-0 items-center justify-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-3 text-xs font-bold text-slate-500 transition hover:border-blue-300 hover:text-blue-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 sm:min-w-28 sm:gap-2 sm:px-5 sm:text-sm"
            >
              <SkipForward size={18} /> <span className="hidden min-[350px]:inline">{copy.skip}</span>
            </button>
          </div>
          {mode === "focus" && time < FOCUS_DURATION && (
            <button
              type="button"
              disabled={sessionBusy || verifying}
              onClick={completeCurrentFocusSession}
              className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300"
            >
              <CheckCircle2 size={17} />{" "}
              {sessionBusy ? copy.savingSession : FOCUS_DURATION-time<1200 ? (locale==='uz'?'Tugallanmagan deb yakunlash':locale==='ru'?'Завершить как неполную':'End incomplete session') : copy.completeSession}
            </button>
          )}
          <div className="mt-6 text-center">
            <p className="text-sm font-semibold text-slate-500">
              {formatFocusCopy(copy.sessionOf, { current: sessionNumber, total: 4 })}
            </p>
            <div className="mt-2 flex justify-center gap-2">
              {Array.from({ length: 4 }, (_, index) => (
                <span
                  key={index}
                  className={cn(
                    "h-3 w-3 rounded-full border",
                    index === sessionNumber - 1
                      ? "border-blue-600 bg-blue-600"
                      : "border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800",
                  )}
                />
              ))}
            </div>
          </div>
        </section>

        <aside className="pro-focus-context space-y-4">
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-black">
                <Target className="text-blue-600" size={24} /> {copy.todaysFocus}
              </h2>
              <button
                type="button"
                aria-label={copy.addTask}
                onClick={() => setTaskInputOpen((current) => !current)}
                className="inline-flex items-center gap-1 rounded-xl border border-blue-200 px-3 py-2 text-sm font-bold text-blue-600 hover:bg-blue-50"
              >
                <Plus size={16} /> {copy.addTask}
              </button>
            </div>
            {taskInputOpen && (
              <form
                className="mt-4 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  updateFocusTask();
                }}
              >
                <input
                  autoFocus
                  value={taskDraft}
                  onChange={(event) => setTaskDraft(event.target.value)}
                  maxLength={120}
                  required
                  aria-label={copy.focusTask}
                  placeholder={copy.taskPlaceholder}
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-800"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-3 text-sm font-bold text-white"
                >
                  {copy.save}
                </button>
              </form>
            )}
            {focusTask ? (
              <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-800">
                <button
                  type="button"
                  aria-label={copy.completeTask}
                  aria-pressed={taskDone}
                  onClick={() => setTaskDone((current) => !current)}
                  className={cn(
                    "grid h-6 w-6 place-items-center rounded-full border-2",
                    taskDone
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-slate-400",
                  )}
                >
                  {taskDone && <Check size={15} strokeWidth={3} />}
                </button>
                <p
                  className={cn(
                    "min-w-0 flex-1 font-semibold",
                    taskDone && "text-slate-400 line-through",
                  )}
                >
                  {focusTask}
                </p>
                <button
                  type="button"
                  aria-label={copy.editTask}
                  onClick={() => {
                    setTaskDraft(focusTask);
                    setTaskInputOpen(true);
                  }}
                  className="text-slate-400 hover:text-blue-600"
                >
                  <Pencil size={17} />
                </button>
              </div>
            ) : (
              <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-800">
                {copy.noTask}
              </p>
            )}
          </section>
          <section className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                <Check size={22} />
              </span>
              <p className="mt-4 text-3xl font-black">{completedToday}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">
                {copy.completedToday}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600">
                <Clock3 size={22} />
              </span>
              <p className="mt-4 text-3xl font-black">{focusMinutes}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">
                {copy.focusMinutes}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-50 text-orange-500">
                <Flame size={22} />
              </span>
              <p className="mt-4 text-3xl font-black text-orange-500">
                {visitStreaks(profile).current}
              </p>
              <p className="mt-1 text-xs font-bold text-slate-500">
                {copy.currentStreak}
              </p>
            </div>
          </section>
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-black">
                <Target className="text-emerald-500" size={22} /> {copy.dailyGoal}
              </h2>
              <span className="font-black text-slate-700 dark:text-slate-200">
                {completedToday} / {DAILY_GOAL}{" "}
                <span className="text-sm text-slate-500">{copy.pomodoros}</span>
              </span>
            </div>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{
                  width: `${Math.min(100, (completedToday / DAILY_GOAL) * 100)}%`,
                }}
              />
            </div>
            <p className="mt-3 text-sm text-slate-500">
              {completedToday
                ? formatFocusCopy(copy.goalProgress, { percent: Math.round((completedToday / DAILY_GOAL) * 100) })
                : copy.goalStart}
            </p>
          </section>
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-black">
                <Volume2 size={22} /> {copy.ambientSound}
              </h2>
              <span className="text-sm font-bold text-blue-600">
                {copy.focusMode}
              </span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2">
              {tracks.map((track) => {
                const Icon = track.icon;
                const selected = music === track.id;
                return (
                  <button
                    key={track.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setMusic(selected ? null : track.id)}
                    className={cn(
                      "flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border px-2 text-sm font-bold transition",
                      selected
                        ? "border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-500/10"
                        : "border-slate-100 bg-slate-50 text-slate-500 hover:border-blue-200 dark:border-slate-800 dark:bg-slate-800",
                    )}
                  >
                    <Icon size={23} />
                    {copy[track.nameKey]}
                  </button>
                );
              })}
            </div>
          </section>
        </aside>
      </div>
      <FocusReflection/>
    </div>
  );
};
