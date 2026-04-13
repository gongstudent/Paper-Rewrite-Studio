import type { TaskHistoryItem } from "../app/types";
import { RiskTag } from "./RiskTag";

type TaskTableProps = {
  items: TaskHistoryItem[];
};

export function TaskTable({ items }: TaskTableProps) {
  if (!items.length) {
    return (
      <div className="rounded-3xl border border-border bg-white p-6 text-sm text-text-600 shadow-soft">
        暂无任务记录。
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-white shadow-soft">
      <table className="min-w-full divide-y divide-slate-100 text-sm">
        <thead className="bg-slate-50/80">
          <tr className="text-left text-text-600">
            <th className="px-6 py-4 font-medium">任务名称</th>
            <th className="px-6 py-4 font-medium">论文名称</th>
            <th className="px-6 py-4 font-medium">开始时间</th>
            <th className="px-6 py-4 font-medium">分析类型</th>
            <th className="px-6 py-4 font-medium">状态</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => (
            <tr key={item.taskId}>
              <td className="px-6 py-4 font-medium">{item.taskName}</td>
              <td className="px-6 py-4 text-text-600">{item.paperTitle ?? "未关联论文"}</td>
              <td className="px-6 py-4 text-text-600">
                {new Date(item.startedAt).toLocaleString("zh-CN")}
              </td>
              <td className="px-6 py-4 text-text-600">{item.analysisType}</td>
              <td className="px-6 py-4">
                <RiskTag
                  label={item.status}
                  tone={item.status === "done" ? "safe" : item.status === "failed" ? "high" : "warning"}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
