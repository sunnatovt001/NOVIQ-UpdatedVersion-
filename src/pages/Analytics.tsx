import {useStudyEvidence,type StudyEvidence} from '@/src/features/pro/useStudyEvidence';
import {activityDay,actualDuration} from '@/src/features/pro/activitySummary';
import {ReferenceActivityRail} from '@/src/features/pro/ReferenceActivityRail';
import {ProEntry} from '@/src/features/pro/ProEntry';
import React, { useEffect, useMemo, useState } from "react";
import { SmartPlannerInsights } from '@/src/features/planner/SmartPlannerInsights';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from "recharts";
import { MeasuredChart } from "@/src/components/MeasuredChart";
import { isMeaningfulSession, missionCompletion } from "@/src/lib/activityEvidence";
import { Calendar, Zap, Brain, Clock, ShieldCheck } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/src/contexts/AuthContext";
import { calculateLevelName, getLocalDayKey } from "@/src/lib/progress";
import { useUserActivityMetrics } from "@/src/lib/useUserActivityMetrics";
import type { StudySession } from "@/src/types";
import { recordDate } from "@/src/lib/recordDate";
import { useLocale, type AppLocale } from "@/src/contexts/LocaleContext";
import { formatAnalyticsCopy, getAnalyticsCopy } from "@/src/features/analytics/analyticsCopy";

const COLORS = ["#315EFB", "#5B7CFA", "#829AF8", "#A8B9F5"];
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type AnalyticsStudySession = StudyEvidence;

const timestampToIso = (value: unknown) => recordDate(value)?.toISOString() || "";

const formatDuration = actualDuration;

const getWeekStart = (weekOffset = 0) => {
  const day=new Date(activityDay(new Date().getTime())+'T00:00:00Z');
  day.setUTCDate(day.getUTCDate()-((day.getUTCDay()+6)%7)+weekOffset*7);
  return day;
};

const buildWeeklyData = (sessions: AnalyticsStudySession[], weekOffset = 0) => {
  const weekStart = getWeekStart(weekOffset);

  return DAY_LABELS.map((name, index) => {
    const date = new Date(weekStart);
    date.setUTCDate(weekStart.getUTCDate() + index);
    const dayKey = date.toISOString().slice(0,10);
    const daySessions = sessions.filter((session) => activityDay(Date.parse(session.timestamp)) === dayKey);
    const seconds = daySessions.reduce((total, session) => total + session.duration, 0);

    return {
      name,
      hours: Number((seconds / 3600).toFixed(2)),
      sessions: daySessions.length,
      seconds,
    };
  });
};

const buildHeatmapData = (sessions: AnalyticsStudySession[], dailyTargetMinutes: number) => {
  const totalsByDay = new Map<string, number>();
  sessions.forEach((session) => {
    const dayKey = getLocalDayKey(session.timestamp);
    totalsByDay.set(dayKey, (totalsByDay.get(dayKey) || 0) + session.duration);
  });

  return Array.from({ length: 35 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - 34 + index);
    const dayKey = getLocalDayKey(date);
    const minutes = (totalsByDay.get(dayKey) || 0) / 60;
    const intensity = minutes <= 0 ? 0 : Math.min(4, Math.ceil((minutes / Math.max(dailyTargetMinutes, 1)) * 4));

    return { dayKey, minutes, intensity };
  });
};

const buildCategoryData = (sessions: AnalyticsStudySession[]) => {
  const totals = new Map<string, number>();

  sessions.forEach((session) => {
    const label = session.subject || session.category || "Study";
    totals.set(label, (totals.get(label) || 0) + session.duration);
  });

  return Array.from(totals.entries())
    .filter(([, seconds]) => seconds > 0)
    .map(([name, seconds]) => ({ name, value: seconds / 60 }))
    .sort((a, b) => b.value - a.value);
};

const heatmapClass = (intensity: number) => {
  if (intensity >= 4) return "bg-blue-600";
  if (intensity === 3) return "bg-blue-500/75";
  if (intensity === 2) return "bg-blue-400/55";
  if (intensity === 1) return "bg-blue-300/35 dark:bg-blue-400/25";
  return "bg-slate-100 dark:bg-white/5";
};

export const Analytics = ({ setActiveTab }: { setActiveTab?: (t: string) => void }) => {
  const { user, profile } = useAuth();
  const { locale } = useLocale();
  const copy = useMemo(() => getAnalyticsCopy(locale), [locale]);
  const activityMetrics = useUserActivityMetrics(user?.uid);
  const evidence=useStudyEvidence(user?.uid,300);
  const [weekOffset,setWeekOffset]=useState(0);
  const studySessions=evidence.records;
  const sessionError=evidence.error?copy.historyError:'';
  const sessionLoading=!evidence.ready;
  const dataReady=evidence.ready&&!evidence.error;
  const dailyTargetMinutes = profile?.dailyTargetMinutes || 30;
  const weeklyData = useMemo(
    () => buildWeeklyData(studySessions, weekOffset).map((day, index) => ({ ...day, name: copy.dayLabels[index] })),
    [copy.dayLabels, studySessions, weekOffset],
  );
  const heatmapData = useMemo(() => buildHeatmapData(studySessions, dailyTargetMinutes), [studySessions, dailyTargetMinutes]);
  const categoryData = useMemo(() => buildCategoryData(studySessions), [studySessions]);
  const totalStudySeconds = useMemo(
    () => studySessions.reduce((total, session) => total + session.duration, 0),
    [studySessions]
  );
  const weeklyStudySeconds = weeklyData.reduce((total, day) => total + day.seconds, 0);
  const weeklyTargetSeconds = dailyTargetMinutes * 7 * 60;
  const weeklyGoalProgress = Math.min(100, Math.round((weeklyStudySeconds / Math.max(weeklyTargetSeconds, 1)) * 100));
  const activeDaysThisWeek = weeklyData.filter((day) => day.seconds > 0).length;
  const totalXp = activityMetrics.xp;
  const latestSession = studySessions[0];
  const reviewCoverage = missionCompletion(activityMetrics.flashcardsCreated, activityMetrics.reviewedCards);
  const totalCategoryMinutes = categoryData.reduce((total, item) => total + item.value, 0);
  const levelName = profile?.levelName || calculateLevelName(totalXp);

  const metricCards = [
    {
      label: copy.recentStudyTime,
      value: formatDuration(totalStudySeconds, locale),
      trend: formatAnalyticsCopy(copy.completedRecords, { count: studySessions.length }),
      icon: Clock,
      color: "text-blue-700 dark:text-blue-300",
      bg: "bg-blue-50 dark:bg-blue-500/10",
    },
    {
      label: weekOffset === 0 ? copy.thisWeek : copy.lastWeek,
      value: formatDuration(weeklyStudySeconds, locale),
      trend: formatAnalyticsCopy(copy.goalPercent, { percent: weeklyGoalProgress }),
      icon: Zap,
      color: "text-blue-700 dark:text-blue-300",
      bg: "bg-blue-50 dark:bg-blue-500/10",
    },
    {
      label: copy.currentStreak,
      value: formatAnalyticsCopy(copy.streakDays, { count: activityMetrics.streak, unit: activityMetrics.streak === 1 ? copy.day : copy.days }),
      trend: formatAnalyticsCopy(copy.activeDays, { count: activeDaysThisWeek }),
      icon: Brain,
      color: "text-blue-700 dark:text-blue-300",
      bg: "bg-blue-50 dark:bg-blue-500/10",
    },
    {
      label: copy.reviewCoverage,
      value: reviewCoverage === null ? copy.notMeasured : `${reviewCoverage}%`,
      trend: copy.reviewedOnce,
      icon: Calendar,
      color: "text-blue-700 dark:text-blue-300",
      bg: "bg-blue-50 dark:bg-blue-500/10",
    },
  ];

  return (
    <div className="pro-analytics-workspace space-y-8 px-0 pb-24 text-slate-950 dark:text-slate-50 sm:space-y-10">
      <div className="flex justify-end"><ProEntry area="reports"/></div>
      <SmartPlannerInsights />
      {evidence.deviceSeconds>0 && <p role="status">{locale==='uz'?'Qurilmada saqlangan faoliyat ham kiritilgan.':locale==='ru'?'Включена активность, сохранённая на устройстве.':'Includes activity saved only on this device.'}</p>}
      {sessionLoading && <p role="status" className="text-sm font-medium text-slate-600 dark:text-slate-300">{copy.loading}</p>}
      {(sessionError || activityMetrics.error) && <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-100">{sessionError || activityMetrics.error} <button type="button" className="ml-2 min-h-11 font-bold underline underline-offset-4" onClick={() => { evidence.retry(); activityMetrics.retry(); }}>{copy.retry}</button></div>}
      <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-8">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
             <div className="w-10 h-1 bg-blue-500 rounded-full" />
             <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-700 dark:text-blue-300">{copy.performanceMetrics}</span>
          </div>
          <h2 className="text-balance font-display text-4xl font-bold leading-tight tracking-tight text-slate-950 dark:text-white sm:text-5xl">{copy.title}</h2>
          <p className="max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300 sm:text-lg">{copy.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-4">
           <div className="min-w-[140px] flex-1 rounded-2xl border border-slate-200 bg-white px-6 py-4 dark:border-slate-700 dark:bg-slate-900">
              <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">{copy.totalXp}</p>
              <p className="text-xl font-bold leading-none text-slate-950 [font-variant-numeric:tabular-nums] dark:text-white sm:text-2xl">{totalXp.toLocaleString(locale)}</p>
           </div>
           <div className="min-w-[140px] flex-1 rounded-2xl border border-slate-200 bg-white px-6 py-4 dark:border-slate-700 dark:bg-slate-900">
              <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">{levelName}</p>
              <p className="text-xl font-bold leading-none text-slate-950 [font-variant-numeric:tabular-nums] dark:text-white sm:text-2xl">{activityMetrics.loading||activityMetrics.error?'—':activityMetrics.level}</p>
           </div>
        </div>
      </header>

      <ReferenceActivityRail/>
      {/* Hero Stats */}
      <div className="pro-analytics-metrics grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metricCards.map((s) => (
          <article key={s.label} className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
            <div className="relative z-10 mb-6 flex items-start justify-between gap-3">
              <div className={cn("p-2.5 sm:p-3 rounded-xl sm:rounded-2xl", s.bg, s.color)}>
                <s.icon size={20} aria-hidden="true" />
              </div>
              <span className="max-w-[11rem] text-right text-[10px] font-bold leading-4 text-slate-500 dark:text-slate-400">{dataReady ? s.trend : sessionLoading ? copy.loading : copy.historyError}</span>
            </div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{s.label}</p>
            <p className="font-display text-2xl font-bold text-slate-950 [font-variant-numeric:tabular-nums] dark:text-white sm:text-3xl">{dataReady && (s.icon===Clock || s.icon===Zap || !activityMetrics.loading&&!activityMetrics.error) ? s.value : '—'}</p>
          </article>
        ))}
      </div>

      <div className="pro-analytics-charts grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Activity Chart */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900 sm:p-8 xl:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8 sm:mb-10">
            <div className="space-y-1">
               <h3 className="text-xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-2xl">{copy.productivityFlow}</h3>
               <p className="text-xs font-medium leading-5 text-slate-500 dark:text-slate-400">{formatAnalyticsCopy(copy.dailyStudyHours, { week: weekOffset === 0 ? copy.currentWeek.toLowerCase() : copy.lastWeek.toLowerCase() })}</p>
            </div>
            <select aria-label={copy.productivityFlow} value={weekOffset} onChange={(event) => setWeekOffset(Number(event.target.value))} className="min-h-11 self-start rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:self-center">
               <option value={0}>{copy.currentWeek}</option>
               <option value={-1}>{copy.lastWeek}</option>
            </select>
          </div>

          <div className="h-[250px] sm:h-[300px] w-full mt-4">
            <MeasuredChart>
              <AreaChart data={weeklyData}>
                <defs>
                  <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--noviq-border)" />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--noviq-muted)", fontSize: 11, fontWeight: 700 }}
                  dy={15}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--noviq-muted)", fontSize: 11, fontWeight: 700 }}
                  dx={-10}
                />
                <Tooltip
                  formatter={(value) => [`${value}`, copy.hours]}
                  contentStyle={{ backgroundColor: "var(--noviq-card)", color: "var(--noviq-text)", border: "1px solid var(--noviq-border)", borderRadius: "16px", padding: "12px", boxShadow: "0 12px 28px rgba(15,23,42,0.14)" }}
                  itemStyle={{ color: "var(--noviq-accent)", fontWeight: "bold" }}
                  cursor={{ stroke: 'var(--noviq-accent)', strokeWidth: 2 }}
                />
                <Area
                  type="monotone"
                  dataKey="hours"
                  stroke="#3b82f6"
                  strokeWidth={4}
                  fillOpacity={1}
                  fill="url(#colorHours)"
                />
              </AreaChart>
            </MeasuredChart>
          </div>
        </section>

        {/* Consistency Heatmap */}
        <section className="pro-engagement-heatmap flex flex-col rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900 sm:p-8">
          <div className="space-y-1 mb-10">
             <h3 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{copy.consistency}</h3>
             <p className="text-xs font-medium leading-5 text-slate-500 dark:text-slate-400">{copy.dailyStudyMinutes}</p>
          </div>

          <div className="flex-1 grid grid-cols-7 gap-2.5">
             {heatmapData.map((item) => (
               <div
                 key={item.dayKey}
                 title={formatAnalyticsCopy(copy.minutesShort, { count: item.minutes })}
                 role="img"
                 aria-label={`${item.dayKey}: ${formatAnalyticsCopy(copy.minutesShort, { count: item.minutes })}`}
                 className={cn(
                   "aspect-square rounded-lg border border-slate-200 dark:border-white/5",
                   heatmapClass(item.intensity)
                 )}
               />
             ))}
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-8 dark:border-slate-700">
             <div className="flex flex-col">
                <span className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">{weekOffset === 0 ? copy.currentWeekGoal : copy.lastWeekGoal}</span>
                <span className="text-lg font-bold leading-none text-slate-950 [font-variant-numeric:tabular-nums] dark:text-white">{formatDuration(weeklyStudySeconds, locale)} / {formatDuration(weeklyTargetSeconds, locale)}</span>
             </div>
             <div className="w-14 h-14 rounded-full border-4 border-blue-600/20 border-t-blue-600 flex items-center justify-center">
                <span className="text-xs font-black text-blue-700 dark:text-blue-300">{weeklyGoalProgress}%</span>
             </div>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Category Breakdown */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900 sm:p-8">
          <h3 className="mb-2 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{copy.studyFocus}</h3>
          <p className="mb-8 text-xs leading-5 text-slate-500 dark:text-slate-400">{copy.focusShare}</p>
          {categoryData.length ? (
            <div className="flex flex-col md:flex-row items-center gap-12">
              <div className="w-full h-[220px]">
                <MeasuredChart>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      innerRadius={70}
                      outerRadius={95}
                      paddingAngle={10}
                      dataKey="value"
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: "var(--noviq-card)", color: "var(--noviq-text)", border: "1px solid var(--noviq-border)", borderRadius: "16px" }} />
                  </PieChart>
                </MeasuredChart>
              </div>
              <div className="space-y-5 w-full">
                {categoryData.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <div className="w-3 h-3 rounded-full shadow-lg" style={{ backgroundColor: COLORS[i % COLORS.length], boxShadow: `0 0 10px ${COLORS[i % COLORS.length]}44` }} />
                      <span className="text-sm font-bold text-slate-600 dark:text-slate-300">{item.name}</span>
                    </div>
                    <span className="font-display text-sm font-black text-slate-950 [font-variant-numeric:tabular-nums] dark:text-white">{Math.round((item.value / Math.max(totalCategoryMinutes, 1)) * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex min-h-[220px] items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
              {copy.noSessions}
            </div>
          )}
        </section>

        {/* Prediction Card */}
        <section className="relative overflow-hidden rounded-3xl border border-blue-200 bg-blue-50 p-6 dark:border-blue-500/25 dark:bg-blue-500/10 sm:p-8">
          <div className="flex items-center gap-3 mb-8">
             <ShieldCheck className="text-blue-700 dark:text-blue-300" size={24} aria-hidden="true" />
             <h3 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{copy.recallGuidance}</h3>
          </div>

          <div className="space-y-3 mb-10">
            <p className="font-medium leading-7 text-slate-700 dark:text-slate-200">
              {latestSession
                ? formatAnalyticsCopy(copy.latestGuidance, { minutes: Math.round(latestSession.duration / 60), subject: latestSession.subject })
                : copy.noGuidance}
            </p>
            <p className="text-xs font-bold leading-5 text-slate-500 dark:text-slate-400">{copy.retentionNote}</p>
          </div>

          <button
            onClick={() => setActiveTab?.('flashcards')}
            className="min-h-12 w-full rounded-2xl bg-blue-600 px-5 py-3 text-center text-sm font-black text-white transition-colors hover:bg-blue-700 active:bg-blue-800"
          >
             {activityMetrics.dueCards > 0 ? formatAnalyticsCopy(copy.reviewDue, { count: activityMetrics.dueCards }) : copy.openDecks}
          </button>
        </section>
      </div>
    </div>
  );
};
