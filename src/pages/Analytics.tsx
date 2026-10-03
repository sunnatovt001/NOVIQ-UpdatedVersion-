import React, { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from "recharts";
import { Calendar, Zap, Brain, Clock, ShieldCheck } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/src/contexts/AuthContext";
import { calculateLevelName, getLocalDayKey } from "@/src/lib/progress";
import { useUserActivityMetrics } from "@/src/lib/useUserActivityMetrics";
import type { StudySession } from "@/src/types";

const COLORS = ["#3b82f6", "#a855f7", "#ec4899", "#f97316"];
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type AnalyticsStudySession = StudySession & { id: string };

const timestampToIso = (value: any, fallback = new Date().toISOString()) => {
  if (typeof value === "string") return value;
  const parsed = value?.toDate?.();
  return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : fallback;
};

const formatDuration = (seconds: number) => {
  const minutes = Math.round(Math.max(0, seconds) / 60);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
};

const getWeekStart = () => {
  const now = new Date();
  const mondayOffset = (now.getDay() + 6) % 7;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(now.getDate() - mondayOffset);
  return start;
};

const buildWeeklyData = (sessions: AnalyticsStudySession[]) => {
  const weekStart = getWeekStart();

  return DAY_LABELS.map((name, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    const dayKey = getLocalDayKey(date);
    const daySessions = sessions.filter((session) => getLocalDayKey(session.timestamp) === dayKey);
    const seconds = daySessions.reduce((total, session) => total + session.duration, 0);

    return {
      name,
      hours: Number((seconds / 3600).toFixed(1)),
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
    const minutes = Math.round((totalsByDay.get(dayKey) || 0) / 60);
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
    .map(([name, seconds]) => ({ name, value: Math.max(1, Math.round(seconds / 60)) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 4);
};

const heatmapClass = (intensity: number) => {
  if (intensity >= 4) return "bg-blue-500 shadow-[0_0_14px_rgba(59,130,246,0.45)]";
  if (intensity === 3) return "bg-blue-500/70 shadow-[0_0_10px_rgba(59,130,246,0.25)]";
  if (intensity === 2) return "bg-cyan-500/45";
  if (intensity === 1) return "bg-emerald-500/25";
  return "bg-white/5";
};

export const Analytics = ({ setActiveTab }: { setActiveTab?: (t: string) => void }) => {
  const { user, profile } = useAuth();
  const activityMetrics = useUserActivityMetrics(user?.uid);
  const [studySessions, setStudySessions] = useState<AnalyticsStudySession[]>([]);

  useEffect(() => {
    if (!user) {
      setStudySessions([]);
      return;
    }

    const sessionsQuery = query(
      collection(db, "users", user.uid, "studySessions"),
      orderBy("timestamp", "desc"),
      limit(300)
    );
    return onSnapshot(
      sessionsQuery,
      (snapshot) => {
        setStudySessions(
          snapshot.docs.map((doc) => {
            const data = doc.data() as any;
            return {
              id: doc.id,
              userId: data.userId || user.uid,
              duration: Number(data.duration) || 0,
              subject: data.subject || "Study",
              category: data.category || "focus",
              xpEarned: Number(data.xpEarned) || 0,
              timestamp: timestampToIso(data.timestamp, timestampToIso(data.createdAt)),
            } as AnalyticsStudySession;
          })
        );
      },
      (error) => {
        console.warn("Analytics session listener failed", error);
      }
    );
  }, [user]);

  const dailyTargetMinutes = profile?.dailyTargetMinutes || 30;
  const weeklyData = useMemo(() => buildWeeklyData(studySessions), [studySessions]);
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
  const retentionConfidence = activityMetrics.examReadiness || (studySessions.length ? Math.min(96, Math.max(45, 48 + weeklyGoalProgress)) : 0);
  const totalCategoryMinutes = categoryData.reduce((total, item) => total + item.value, 0);
  const levelName = profile?.levelName || calculateLevelName(totalXp);

  const metricCards = [
    {
      label: "Study Time",
      value: formatDuration(totalStudySeconds),
      trend: `${studySessions.length} session${studySessions.length === 1 ? "" : "s"}`,
      icon: Clock,
      color: "text-blue-400",
      bg: "bg-blue-500/5",
    },
    {
      label: "This Week",
      value: formatDuration(weeklyStudySeconds),
      trend: `${weeklyGoalProgress}% goal`,
      icon: Zap,
      color: "text-purple-400",
      bg: "bg-purple-500/5",
    },
    {
      label: "Current Streak",
      value: `${activityMetrics.streak} day${activityMetrics.streak === 1 ? "" : "s"}`,
      trend: `${activeDaysThisWeek}/7 active`,
      icon: Brain,
      color: "text-pink-400",
      bg: "bg-pink-500/5",
    },
    {
      label: "Retention",
      value: `${retentionConfidence}%`,
      trend: "Live",
      icon: Calendar,
      color: "text-orange-400",
      bg: "bg-orange-500/5",
    },
  ];

  return (
    <div className="space-y-12 pb-24 px-2 sm:px-0">
      <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-8">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
             <div className="w-10 h-1 bg-blue-500 rounded-full" />
             <span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.4em]">Performance Metrics</span>
          </div>
          <h2 className="text-4xl sm:text-5xl font-bold font-display tracking-tight text-white leading-tight">Advanced Analytics</h2>
          <p className="text-slate-400 text-base sm:text-lg">Detailed insight into your cognitive load and productivity trends.</p>
        </div>
        <div className="flex flex-wrap gap-4">
           <div className="flex-1 min-w-[140px] glass px-6 py-4 border-white/5 bg-white/[0.02]">
              <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">Total XP</p>
              <p className="text-xl sm:text-2xl font-bold text-white leading-none">{totalXp.toLocaleString()}</p>
           </div>
           <div className="flex-1 min-w-[140px] glass px-6 py-4 border-white/5 bg-white/[0.02]">
              <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">{levelName}</p>
              <p className="text-xl sm:text-2xl font-bold text-white leading-none">{activityMetrics.level}</p>
           </div>
        </div>
      </header>

      {/* Hero Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {metricCards.map((s) => (
          <div key={s.label} className="glass p-6 sm:p-8 border-white/5 relative overflow-hidden group hover:scale-[1.02] transition-all">
            <div className={cn("absolute -right-4 -top-4 w-24 h-24 rounded-full blur-3xl opacity-10", s.bg)} />
            <div className="flex items-center justify-between mb-6 sm:mb-8 relative z-10">
              <div className={cn("p-2.5 sm:p-3 rounded-xl sm:rounded-2xl", s.bg, s.color)}>
                <s.icon size={20} />
              </div>
              <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">{s.trend}</span>
            </div>
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">{s.label}</p>
            <p className="text-2xl sm:text-3xl font-bold font-display text-white">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Activity Chart */}
        <section className="glass p-6 sm:p-10 xl:col-span-2 border-white/5 bg-white/[0.01]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8 sm:mb-10">
            <div className="space-y-1">
               <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Productivity Flow</h3>
               <p className="text-[10px] sm:text-xs font-medium text-slate-500">Hourly engagement across the week</p>
            </div>
            <select className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400 self-start sm:self-center">
               <option>Current Week</option>
               <option>Last Week</option>
            </select>
          </div>
          
          <div className="h-[250px] sm:h-[300px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklyData}>
                <defs>
                  <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff05" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: "#64748b", fontSize: 11, fontWeight: 700 }}
                  dy={15}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: "#64748b", fontSize: 11, fontWeight: 700 }}
                  dx={-10}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "20px", padding: "16px", boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}
                  itemStyle={{ color: "#3b82f6", fontWeight: "bold" }}
                  cursor={{ stroke: '#3b82f6', strokeWidth: 2 }}
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
            </ResponsiveContainer>
          </div>
        </section>

        {/* Consistency Heatmap */}
        <section className="glass p-10 border-white/5 flex flex-col bg-white/[0.01]">
          <div className="space-y-1 mb-10">
             <h3 className="text-2xl font-bold text-white tracking-tight">Consistency</h3>
             <p className="text-xs font-medium text-slate-500">Your daily exam-prep frequency</p>
          </div>
          
          <div className="flex-1 grid grid-cols-7 gap-2.5">
             {heatmapData.map((item) => (
               <div 
                 key={item.dayKey} 
                 title={`${item.minutes} min`}
                 className={cn(
                   "aspect-square rounded-lg border border-white/5 transition-all hover:scale-110",
                   heatmapClass(item.intensity)
                 )} 
               />
             ))}
          </div>

          <div className="mt-8 pt-8 border-t border-white/5 flex items-center justify-between">
             <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">Weekly Goal</span>
                <span className="text-lg font-bold text-white leading-none">{formatDuration(weeklyStudySeconds)} / {formatDuration(weeklyTargetSeconds)}</span>
             </div>
             <div className="w-14 h-14 rounded-full border-4 border-blue-600/20 border-t-blue-600 flex items-center justify-center">
                <span className="text-xs font-black text-blue-400">{weeklyGoalProgress}%</span>
             </div>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Category Breakdown */}
        <section className="glass p-10 border-white/5 bg-white/[0.01]">
          <h3 className="text-2xl font-bold text-white tracking-tight mb-10">Study Focus</h3>
          {categoryData.length ? (
            <div className="flex flex-col md:flex-row items-center gap-12">
              <div className="w-full h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
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
                    <Tooltip 
                      contentStyle={{ backgroundColor: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-5 w-full">
                {categoryData.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <div className="w-3 h-3 rounded-full shadow-lg" style={{ backgroundColor: COLORS[i], boxShadow: `0 0 10px ${COLORS[i]}44` }} />
                      <span className="text-sm font-bold text-slate-400 group-hover:text-white transition-colors">{item.name}</span>
                    </div>
                    <span className="text-sm font-black font-display text-white">{Math.round((item.value / Math.max(totalCategoryMinutes, 1)) * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex min-h-[220px] items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/[0.02] text-sm font-bold text-slate-500">
              No study sessions yet.
            </div>
          )}
        </section>

        {/* Prediction Card */}
        <section className="glass p-10 border-orange-500/20 bg-gradient-to-tr from-orange-600/5 to-transparent relative group overflow-hidden">
          <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-orange-600/10 rounded-full blur-3xl opacity-50 group-hover:scale-150 transition-all duration-700" />
          
          <div className="flex items-center gap-3 mb-8">
             <ShieldCheck className="text-orange-400" size={24} />
             <h3 className="text-2xl font-bold text-orange-400 tracking-tight">AI Retention Shield</h3>
          </div>
          
          <div className="space-y-3 mb-10">
            <p className="text-slate-300 leading-relaxed font-medium">
              {latestSession
                ? `Your latest ${Math.round(latestSession.duration / 60)} minute ${latestSession.subject} session is ready for review. Convert it into recall cards before starting the next topic.`
                : "Complete a focus session to unlock retention guidance from your own activity."}
            </p>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Confidence Score: {retentionConfidence}%</p>
          </div>

          <button 
            onClick={() => setActiveTab?.('flashcards')}
            className="w-full py-5 rounded-[2rem] bg-orange-500 hover:bg-orange-400 text-white font-black uppercase tracking-[0.2em] text-xs transition-all shadow-2xl shadow-orange-500/30 active:scale-95 text-center"
          >
             Intervene Now: Flashcard Sprint
          </button>
        </section>
      </div>
    </div>
  );
};
