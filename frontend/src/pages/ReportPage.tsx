import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, Clock3, FileWarning, Sparkles } from "lucide-react";
import { api } from "../app/api";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { RiskTag } from "../components/RiskTag";
import { StatCard } from "../components/StatCard";

export function ReportPage() {
  const { taskId = "" } = useParams();
  const navigate = useNavigate();
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

  const taskQuery = useQuery({
    queryKey: ["detection-task", taskId],
    queryFn: () => api.getDetectionTask(taskId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "pending" || status === "running" ? 2500 : false;
    },
    retry: false
  });

  const summaryQuery = useQuery({
    queryKey: ["detection-summary", taskQuery.data?.docId],
    queryFn: () => api.getDetectionSummary(taskQuery.data!.docId),
    enabled: Boolean(taskQuery.data?.docId),
    retry: false
  });

  const documentQuery = useQuery({
    queryKey: ["documents", taskQuery.data?.docId],
    queryFn: () => api.getDocument(taskQuery.data!.docId),
    enabled: Boolean(taskQuery.data?.docId),
    retry: false
  });

  const task = taskQuery.data;
  const segmentResults = task?.segmentResults ?? [];
  const paragraphMap = useMemo(
    () => new Map(segmentResults.map((item) => [item.segmentId, item])),
    [segmentResults]
  );
  const excludedSegmentSet = useMemo(
    () => new Set(task?.excludedSegmentIds ?? []),
    [task?.excludedSegmentIds]
  );
  const highRiskIds = useMemo(
    () => segmentResults.filter((item) => item.riskScore >= 70).map((item) => item.segmentId),
    [segmentResults]
  );
  const actionableSegmentIds = useMemo(() => {
    const ids =
      highRiskIds.length > 0
        ? highRiskIds
        : segmentResults.map((item) => item.segmentId);

    return Array.from(new Set(ids));
  }, [highRiskIds, segmentResults]);

  const selectedSegment =
    selectedSegmentId == null
      ? segmentResults[0] ?? null
      : segmentResults.find((item) => item.segmentId === selectedSegmentId) ?? null;
  const selectedParagraph = documentQuery.data?.paragraphs.find(
    (paragraph) => paragraph.segmentId === selectedSegmentId
  );
  const selectedParagraphIsExcluded =
    selectedParagraph != null ? excludedSegmentSet.has(selectedParagraph.segmentId) : false;
  const highRiskCount = highRiskIds.length;
  const includedCount = task?.includedSegmentIds.length ?? 0;
  const processedCount = Math.max(0, includedCount - highRiskCount);

  const buildRewriteUrl = (focusSegmentId?: string) => {
    if (!task?.docId || actionableSegmentIds.length === 0) {
      return "/rewrite";
    }

    const params = new URLSearchParams();
    params.set("segmentIds", actionableSegmentIds.join(","));
    params.set("from", "report");
    params.set("reportTaskId", task.taskId);
    if (focusSegmentId) {
      params.set("focusSegmentId", focusSegmentId);
    }

    return `/rewrite/${task.docId}?${params.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="检测报告"
        description="查看重复率与 AIGC 风险热区，并直接跳转到改写工作台。"
        actions={
          <button
            onClick={() => navigate(buildRewriteUrl(selectedSegment?.segmentId))}
            disabled={!task?.docId || actionableSegmentIds.length === 0}
            className="inline-flex items-center gap-2 rounded-2xl bg-primary-500 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            去改写
            <ArrowRight className="h-4 w-4" />
          </button>
        }
      />

      {taskQuery.isLoading ? (
        <div className="rounded-3xl border border-border bg-white p-8 text-sm text-text-600 shadow-soft">
          正在加载检测报告...
        </div>
      ) : null}

      {taskQuery.isError ? (
        <EmptyState
          title="检测报告加载失败"
          description="当前无法读取检测任务，请确认后端服务已启动，然后刷新页面重试。"
        />
      ) : null}

      {task?.status === "pending" || task?.status === "running" ? (
        <div className="rounded-3xl border border-border bg-white p-8 shadow-soft">
          <p className="text-lg font-semibold">检测任务执行中...</p>
          <div className="mt-4 h-3 rounded-full bg-slate-200">
            <div
              className="h-3 rounded-full bg-primary-500 transition-all"
              style={{ width: `${task.progress}%` }}
            />
          </div>
          <p className="mt-3 text-sm text-text-600">当前进度 {task.progress}%</p>
          <div className="mt-4 rounded-2xl border border-primary-50 bg-primary-50/60 px-4 py-3 text-sm text-primary-600">
            检测可能会持续一段时间，你可以先处理其他页面，任务会在后台继续执行。
          </div>
        </div>
      ) : null}

      {task?.status === "failed" ? (
        <div className="rounded-3xl border border-red-200 bg-white p-8 shadow-soft">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-danger" />
            <div>
              <p className="text-lg font-semibold">检测失败</p>
              <p className="mt-2 text-sm leading-7 text-text-600">
                {task.errorMessage || "检测任务执行失败，请稍后重新发起检测。"}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {!taskQuery.isError && task && task.segmentResults.length > 0 ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="查重率"
              value={`${task.plagiarismScore ?? summaryQuery.data?.plagiarismScore ?? 0}%`}
              icon={<FileWarning className="h-5 w-5" />}
              tone="danger"
            />
            <StatCard
              label="AIGC 指数"
              value={`${task.aigcScore ?? summaryQuery.data?.aigcScore ?? 0}%`}
              icon={<Sparkles className="h-5 w-5" />}
              tone="aigc"
            />
            <StatCard
              label="高风险段落"
              value={highRiskCount}
              icon={<FileWarning className="h-5 w-5" />}
            />
            <StatCard
              label="已通过段落"
              value={processedCount}
              icon={<Sparkles className="h-5 w-5" />}
            />
          </div>

          <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_360px]">
            <div className="rounded-3xl border border-border bg-white p-6 shadow-soft">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">
                    {documentQuery.data?.title ?? "论文正文风险热区"}
                  </h2>
                  <p className="mt-1 text-sm text-text-600">
                    点击任意段落查看右侧详情；已排除段会明确显示为“不参与检测”。
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-full bg-slate-50 px-4 py-2 text-sm text-text-600">
                  <Clock3 className="h-4 w-4" />
                  检测耗时 {task.elapsedSeconds}s
                </div>
              </div>

              <div className="space-y-4">
                {documentQuery.data?.paragraphs.map((paragraph) => {
                  const segment = paragraphMap.get(paragraph.segmentId);
                  const isActive = selectedSegmentId === paragraph.segmentId;
                  const isExcluded = excludedSegmentSet.has(paragraph.segmentId);
                  const isHigh = (segment?.riskScore ?? 0) >= 70;
                  const isAigc = (segment?.aigcScore ?? 0) >= 70;

                  return (
                    <button
                      key={paragraph.segmentId}
                      onClick={() => setSelectedSegmentId(paragraph.segmentId)}
                      className={`block w-full rounded-2xl border p-5 text-left transition ${
                        isExcluded
                          ? "border-amber-200 bg-amber-50/70"
                          : isActive
                            ? "border-primary-500 bg-primary-50"
                            : isHigh
                              ? "border-red-200 bg-red-50/75"
                              : isAigc
                                ? "border-rose-200 bg-rose-50/75"
                                : "border-border bg-slate-50/60"
                      }`}
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-wide text-text-600">
                          段落 {paragraph.order}
                        </span>
                        {isExcluded ? (
                          <RiskTag label="不参与检测" tone="warning" />
                        ) : segment ? (
                          <div className="flex flex-wrap gap-2">
                            <RiskTag
                              label={`风险 ${segment.riskScore}%`}
                              tone={segment.riskScore >= 70 ? "high" : "warning"}
                            />
                            <RiskTag
                              label={
                                segment.riskType === "mixed"
                                  ? "混合风险"
                                  : segment.riskType === "aigc"
                                    ? "AI 风险"
                                    : "查重风险"
                              }
                              tone={segment.riskType === "mixed" ? "mixed" : "warning"}
                            />
                          </div>
                        ) : (
                          <RiskTag label="通过检测" tone="safe" />
                        )}
                      </div>
                      <p className="leading-8 text-text-900">
                        {paragraph.currentText || paragraph.text}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-3xl border border-border bg-white p-6 shadow-soft">
                <h2 className="text-lg font-semibold">报告概览</h2>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-red-50 p-4">
                    <p className="text-sm text-danger">查重率</p>
                    <p className="mt-2 text-3xl font-semibold text-danger">
                      {task.plagiarismScore ?? summaryQuery.data?.plagiarismScore ?? 0}%
                    </p>
                  </div>
                  <div className="rounded-2xl bg-rose-50 p-4">
                    <p className="text-sm text-aigc">AIGC 指数</p>
                    <p className="mt-2 text-3xl font-semibold text-aigc">
                      {task.aigcScore ?? summaryQuery.data?.aigcScore ?? 0}%
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-border bg-white p-6 shadow-soft">
                <h2 className="text-lg font-semibold">段落风险详情</h2>
                {selectedSegment && !selectedParagraphIsExcluded ? (
                  <div className="mt-4 space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <RiskTag
                        label={`综合风险 ${selectedSegment.riskScore}%`}
                        tone={selectedSegment.riskScore >= 70 ? "high" : "warning"}
                      />
                      <RiskTag
                        label={`查重 ${selectedSegment.plagiarismScore ?? 0}%`}
                        tone={
                          (selectedSegment.plagiarismScore ?? 0) >= 70 ? "high" : "warning"
                        }
                      />
                      <RiskTag
                        label={`AIGC ${selectedSegment.aigcScore ?? 0}%`}
                        tone={(selectedSegment.aigcScore ?? 0) >= 70 ? "high" : "mixed"}
                      />
                    </div>
                    <p className="rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-text-600">
                      {selectedSegment.evidence.reason || "暂无风险说明"}
                    </p>
                    <p className="text-sm leading-7 text-text-600">
                      {selectedSegment.suggestedAction}
                    </p>
                    <button
                      onClick={() => navigate(buildRewriteUrl(selectedSegment.segmentId))}
                      className="w-full rounded-2xl bg-primary-500 px-4 py-3 text-sm font-semibold text-white"
                    >
                      一键跳转去改写
                    </button>
                  </div>
                ) : (
                  <p className="mt-4 text-sm leading-7 text-text-600">
                    当前段落未参与检测，或请先从左侧选择一个参与检测的段落查看详情。
                  </p>
                )}
              </div>
            </div>
          </div>
        </>
      ) : task?.status === "done" ? (
        <EmptyState
          title="当前没有可展示的风险段落"
          description="这次检测没有生成段落级结果，可能是文档为空，或当前参与检测的段落已经全部被排除。"
        />
      ) : null}
    </>
  );
}
