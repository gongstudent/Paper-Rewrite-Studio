import type { ReactNode } from "react";

type StatCardProps = {
  label: string;
  value: string | number;
  icon: ReactNode;
  tone?: "default" | "danger" | "aigc";
};

export function StatCard({
  label,
  value,
  icon,
  tone = "default"
}: StatCardProps) {
  const toneClass =
    tone === "danger"
      ? "bg-red-50 text-danger"
      : tone === "aigc"
        ? "bg-rose-50 text-aigc"
        : "bg-primary-50 text-primary-500";

  return (
    <div className="rounded-3xl border border-border bg-white p-5 shadow-soft">
      <div className="flex items-center gap-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${toneClass}`}>
          {icon}
        </div>
        <div>
          <p className="text-sm text-text-600">{label}</p>
          <p className="mt-1 text-3xl font-semibold">{value}</p>
        </div>
      </div>
    </div>
  );
}
