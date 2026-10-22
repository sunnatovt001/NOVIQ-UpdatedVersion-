import React from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/src/lib/utils";

export const EmptyState = ({ message }: { message: string }) => (
  <div className="admin-soft-surface rounded-[1.35rem] border border-dashed p-6 text-sm text-[var(--admin-muted)]">
    {message}
  </div>
);

type MetricTone = "indigo" | "cyan" | "green" | "amber" | "rose";

const metricToneClasses: Record<MetricTone, { icon: string; surface: string }> = {
  indigo: { icon: "text-indigo-600", surface: "bg-indigo-50 dark:bg-indigo-400/10" },
  cyan: { icon: "text-cyan-600", surface: "bg-cyan-50 dark:bg-cyan-400/10" },
  green: { icon: "text-emerald-600", surface: "bg-emerald-50 dark:bg-emerald-400/10" },
  amber: { icon: "text-amber-600", surface: "bg-amber-50 dark:bg-amber-400/10" },
  rose: { icon: "text-rose-600", surface: "bg-rose-50 dark:bg-rose-400/10" },
};

export const MetricCard = ({
  label,
  value,
  detail,
  icon: Icon,
  accent,
  bg,
  tone = "cyan",
  trend,
  className,
  valueClassName,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: React.ElementType;
  accent?: string;
  bg?: string;
  tone?: MetricTone;
  trend?: string;
  className?: string;
  valueClassName?: string;
}) => (
  <div className={cn("admin-metric-card rounded-[1.45rem] border p-5", className)}>
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--admin-muted)]">{label}</p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <p className={cn("font-display text-3xl font-bold tracking-[-0.04em] text-[var(--admin-heading)]", valueClassName)}>{value}</p>
          {trend && (
            <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-extrabold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
              <ArrowUpRight size={11} />
              {trend}
            </span>
          )}
        </div>
        {detail && <p className="mt-2 text-xs leading-5 text-[var(--admin-muted)]">{detail}</p>}
      </div>
      <div className={cn("rounded-2xl p-3", bg || metricToneClasses[tone].surface)}>
        <Icon size={21} strokeWidth={2.1} className={accent || metricToneClasses[tone].icon} />
      </div>
    </div>
  </div>
);

export const StatusBadge = ({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "good" | "warn" | "danger" | "info" | "neutral";
}) => (
  <span
    className={cn(
      "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em]",
      tone === "good"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300"
        : tone === "warn"
          ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200"
          : tone === "danger"
            ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200"
            : tone === "info"
              ? "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-200"
              : "border-[var(--admin-border)] bg-[var(--admin-soft)] text-[var(--admin-body)]"
    )}
  >
    {children}
  </span>
);

export const Section = ({
  title,
  eyebrow,
  children,
  action,
  className,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) => (
  <section className={cn("admin-panel rounded-[1.75rem] border p-5 sm:p-6", className)}>
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        {eyebrow && <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-indigo-600 dark:text-indigo-300">{eyebrow}</p>}
        <h3 className="mt-2 font-display text-2xl font-bold tracking-[-0.035em] text-[var(--admin-heading)]">{title}</h3>
      </div>
      {action}
    </div>
    {children}
  </section>
);

export const AdminChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/95 px-3 py-2.5 shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <div className="mt-2 space-y-1">
        {payload.map((item: any) => (
          <div key={item.dataKey} className="flex items-center justify-between gap-5 text-xs">
            <span className="flex items-center gap-2 text-slate-500 dark:text-slate-300">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.name}
            </span>
            <span className="font-bold text-slate-900 dark:text-white">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

