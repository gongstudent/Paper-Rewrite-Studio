import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api } from "../app/api";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { RiskTag } from "../components/RiskTag";

export function SearchPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [input, setInput] = useState(searchParams.get("q") ?? "");
  const query = searchParams.get("q") ?? "";

  const searchQuery = useQuery({
    queryKey: ["search", query],
    queryFn: () => api.search(query),
    retry: false
  });

  const sections = useMemo(() => {
    if (!searchQuery.data) {
      return [];
    }
    return [
      { title: "论文", items: searchQuery.data.documents },
      { title: "检测任务", items: searchQuery.data.detectionTasks },
      { title: "改写任务", items: searchQuery.data.rewriteTasks }
    ].filter((section) => section.items.length > 0);
  }, [searchQuery.data]);

  return (
    <>
      <PageHeader
        title="搜索工作台"
        description="搜索论文、检测任务和改写任务，快速跳到对应页面。"
      />

      <div className="rounded-3xl border border-border bg-white p-6 shadow-soft">
        <div className="flex gap-3">
          <div className="flex flex-1 items-center gap-3 rounded-2xl border border-border bg-slate-50 px-4 py-3">
            <Search className="h-4 w-4 text-text-600" />
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setSearchParams(input ? { q: input } : {});
                }
              }}
              className="w-full bg-transparent outline-none"
              placeholder="输入论文标题、任务号或关键词"
            />
          </div>
          <button
            onClick={() => setSearchParams(input ? { q: input } : {})}
            className="rounded-2xl bg-primary-500 px-5 py-3 text-sm font-semibold text-white"
          >
            搜索
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {searchQuery.isLoading ? (
          <div className="rounded-3xl border border-border bg-white p-8 text-sm text-text-600 shadow-soft">
            正在搜索...
          </div>
        ) : null}

        {searchQuery.isError ? (
          <EmptyState
            title="搜索失败"
            description="当前无法执行全局搜索，请确认后端服务正常后重试。"
          />
        ) : null}

        {!searchQuery.isLoading && !searchQuery.isError && sections.length === 0 ? (
          <EmptyState
            title={query ? "没有匹配结果" : "输入关键词开始搜索"}
            description={
              query
                ? "可以尝试搜索论文标题、任务号，或先从工作台进入对应功能。"
                : "搜索会覆盖论文、检测任务和改写任务。"
            }
          />
        ) : null}

        {sections.map((section) => (
          <div
            key={section.title}
            className="rounded-3xl border border-border bg-white p-6 shadow-soft"
          >
            <h2 className="text-xl font-semibold">{section.title}</h2>
            <div className="mt-4 grid gap-3">
              {section.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => navigate(item.route)}
                  className="rounded-2xl border border-border bg-slate-50/60 p-4 text-left"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{item.title}</p>
                      <p className="mt-1 text-sm text-text-600">{item.subtitle}</p>
                    </div>
                    <RiskTag
                      label={item.type}
                      tone={
                        item.type === "document"
                          ? "safe"
                          : item.type === "detection"
                            ? "warning"
                            : "mixed"
                      }
                    />
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
