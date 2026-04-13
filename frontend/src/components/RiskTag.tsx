type RiskTagProps = {
  label: string;
  tone: "high" | "warning" | "safe" | "mixed";
};

export function RiskTag({ label, tone }: RiskTagProps) {
  const toneClass =
    tone === "high"
      ? "bg-red-50 text-danger"
      : tone === "warning"
        ? "bg-amber-50 text-warning"
        : tone === "mixed"
          ? "bg-rose-50 text-aigc"
          : "bg-emerald-50 text-success";

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${toneClass}`}>
      {label}
    </span>
  );
}
