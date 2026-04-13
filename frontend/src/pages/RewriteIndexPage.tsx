import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { api } from "../app/api";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { RiskTag } from "../components/RiskTag";

export function RewriteIndexPage() {
  const navigate = useNavigate();
  const documentsQuery = useQuery({
    queryKey: ["documents", "all"],
    queryFn: api.listDocuments,
    retry: false
  });

  const documents = documentsQuery.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="改写平台"
        description="从已处理论文中进入改写流程；如果还没有报告，先从论文详情或检测报告进入。"
      />

      {documentsQuery.isLoading ? (
        <div className="rounded-3xl border border-border bg-white p-8 text-sm text-text-600 shadow-soft">
          正在加载改写入口...
        </div>
      ) : documentsQuery.isError ? (
        <EmptyState
          title="改写入口加载失败"
          description="当前无法读取论文列表，请确认后端服务已启动，然后刷新页面重试。"
        />
      ) : documents.length === 0 ? (
        <EmptyState
          title="还没有可改写的论文"
          description="先上传并完成一次检测，之后就可以从这里进入改写工作台。"
        />
      ) : (
        <div className="grid gap-4">
          {documents.map((document) => (
            <div
              key={document.docId}
              className="rounded-3xl border border-border bg-white p-6 shadow-soft"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{document.title}</h2>
                  <p className="mt-2 text-sm text-text-600">
                    当前状态：{document.status} · 最近检测：{document.latestDetectionStatus ?? "暂无"}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <RiskTag
                      label={`AI ${document.aigcRiskLevel}`}
                      tone={
                        document.aigcRiskLevel === "high"
                          ? "high"
                          : document.aigcRiskLevel === "warning"
                            ? "warning"
                            : "safe"
                      }
                    />
                    <RiskTag
                      label={`重复率 ${document.plagiarismRiskLevel}`}
                      tone={
                        document.plagiarismRiskLevel === "high"
                          ? "high"
                          : document.plagiarismRiskLevel === "warning"
                            ? "warning"
                            : "safe"
                      }
                    />
                  </div>
                </div>

                <button
                  onClick={() =>
                    document.latestDetectionTaskId
                      ? navigate(`/reports/${document.latestDetectionTaskId}`)
                      : navigate(`/documents/${document.docId}`)
                  }
                  className="inline-flex items-center gap-2 rounded-2xl bg-primary-500 px-5 py-3 text-sm font-semibold text-white"
                >
                  <Sparkles className="h-4 w-4" />
                  {document.latestDetectionTaskId ? "进入改写流程" : "先去检测"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
