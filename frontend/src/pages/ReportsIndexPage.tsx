import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../app/api";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { RiskTag } from "../components/RiskTag";

export function ReportsIndexPage() {
  const navigate = useNavigate();
  const documentsQuery = useQuery({
    queryKey: ["documents", "all"],
    queryFn: api.listDocuments,
    retry: false
  });

  const documents = documentsQuery.data?.items ?? [];
  const documentsWithReports = documents.filter((item) => item.latestDetectionTaskId);

  return (
    <>
      <PageHeader
        title="检测报告"
        description="查看已经生成的检测结果，或从论文详情页重新发起检测。"
      />

      {documentsQuery.isLoading ? (
        <div className="rounded-3xl border border-border bg-white p-8 text-sm text-text-600 shadow-soft">
          正在加载报告列表...
        </div>
      ) : documentsQuery.isError ? (
        <EmptyState
          title="报告列表加载失败"
          description="当前无法读取检测报告，请确认后端服务已启动，然后刷新页面重试。"
        />
      ) : documentsWithReports.length === 0 ? (
        <EmptyState
          title="还没有检测报告"
          description="先进入论文详情页发起检测，完成后这里会展示你的全部报告入口。"
        />
      ) : (
        <div className="grid gap-4">
          {documentsWithReports.map((document) => (
            <div
              key={document.docId}
              className="rounded-3xl border border-border bg-white p-6 shadow-soft"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{document.title}</h2>
                  <p className="mt-2 text-sm text-text-600">
                    检测任务：{document.latestDetectionTaskId}
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
                  onClick={() => navigate(`/reports/${document.latestDetectionTaskId}`)}
                  className="rounded-2xl bg-primary-500 px-5 py-3 text-sm font-semibold text-white"
                >
                  打开检测报告
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
