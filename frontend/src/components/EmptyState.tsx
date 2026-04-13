import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-white p-10 text-center shadow-soft">
      <h3 className="text-2xl font-semibold">{title}</h3>
      <p className="mx-auto mt-3 max-w-xl text-text-600">{description}</p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}
