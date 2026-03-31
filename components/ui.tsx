import type { ReactNode } from "react";

function joinClasses(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

type CardProps = {
  children: ReactNode;
  className?: string;
};

export function Card({ children, className }: CardProps) {
  return <section className={joinClasses("rounded-3xl border border-slate-200 bg-white p-6 shadow-sm", className)}>{children}</section>;
}

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export function PageHeader({ eyebrow, title, description }: PageHeaderProps) {
  return (
    <header className="space-y-3">
      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-700">{eyebrow}</p>
      <div className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">{title}</h1>
        <p className="max-w-4xl text-base leading-7 text-slate-600 sm:text-lg">{description}</p>
      </div>
    </header>
  );
}

type SectionTitleProps = {
  title: string;
  description?: string;
};

export function SectionTitle({ title, description }: SectionTitleProps) {
  return (
    <div className="space-y-1.5">
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
      {description ? <p className="text-sm leading-6 text-slate-600">{description}</p> : null}
    </div>
  );
}

type StatCardProps = {
  label: string;
  value: string;
  helper?: string;
};

export function StatCard({ label, value, helper }: StatCardProps) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
      {helper ? <p className="mt-2 text-sm leading-6 text-slate-600">{helper}</p> : null}
    </div>
  );
}

type BadgeProps = {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
};

const badgeStyles: Record<NonNullable<BadgeProps["tone"]>, string> = {
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  danger: "bg-rose-50 text-rose-700 border-rose-200",
  info: "bg-cyan-50 text-cyan-700 border-cyan-200",
};

export function Badge({ children, tone = "neutral" }: BadgeProps) {
  return (
    <span className={joinClasses("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium uppercase tracking-wide", badgeStyles[tone])}>
      {children}
    </span>
  );
}

type EmptyStateProps = {
  title: string;
  description: string;
};

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center">
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}
