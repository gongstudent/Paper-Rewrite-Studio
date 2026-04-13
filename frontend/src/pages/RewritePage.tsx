import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowLeftRight, X } from "lucide-react";
import { api } from "../app/api";
import type { RecheckResult, RewriteCandidate } from "../app/types";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { RiskTag } from "../components/RiskTag";

export function RewritePage() {
  const { docId = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const searchKey = searchParams.toString();

  const segmentIds = useMemo(() => {
    const raw = (searchParams.get("segmentIds") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    return Array.from(new Set(raw));
  }, [searchKey]);

  const focusSegmentId = searchParams.get("focusSegmentId");
  const from = searchParams.get("from");
  const reportTaskId = searchParams.get("reportTaskId");
  const taskIdFromQuery = searchParams.get("taskId")?.trim() || null;

  const [taskId, setTaskId] = useState<string | null>(taskIdFromQuery);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Record<string, string>>({});
  const [manualEditOpen, setManualEditOpen] = useState(false);
  const [manualText, setManualText] = useState("");
  const [recheckResult, setRecheckResult] = useState<RecheckResult | null>(null);
  const [recheckModalOpen, setRecheckModalOpen] = useState(false);

  const invalidateRewriteRelatedQueries = async () => {
    await queryClient.invalidateQueries({ queryKey: ["documents", docId] });
    await queryClient.invalidateQueries({ queryKey: ["documents", "all"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard", "recent-documents"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard", "active-task"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard", "task-history", "rewrite"] });
  };

  const documentQuery = useQuery({
    queryKey: ["documents", docId],
    queryFn: () => api.getDocument(docId),
    enabled: Boolean(docId),
    retry: false
  });

  const createTaskMutation = useMutation({
    mutationFn: () =>
      api.createRewriteTask({
        docId,
        segmentIds,
        strategy: "lower_aigc",
        options: {
          tone: "academic",
          preserveTerms: true,
          preserveCitations: true,
          preserveNumbers: true
        }
      }),
    onSuccess: (result) => setTaskId(result.taskId)
  });

  const rewriteTaskQuery = useQuery({
    queryKey: ["rewrite-task", taskId],
    queryFn: () => api.getRewriteTask(taskId!),
    enabled: Boolean(taskId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "pending" || status === "running" ? 2500 : false;
    },
    retry: false
  });

  const acceptMutation = useMutation({
    mutationFn: (candidateId: string) => api.acceptCandidate(candidateId),
    onSuccess: async () => {
      if (taskId) {
        await queryClient.invalidateQueries({ queryKey: ["rewrite-task", taskId] });
      }
      await invalidateRewriteRelatedQueries();
    }
  });

  const rollbackMutation = useMutation({
    mutationFn: (candidateId: string) => api.rollbackCandidate(candidateId),
    onSuccess: async () => {
      if (taskId) {
        await queryClient.invalidateQueries({ queryKey: ["rewrite-task", taskId] });
      }
      await invalidateRewriteRelatedQueries();
    }
  });

  const retryMutation = useMutation({
    mutationFn: () => api.retryRewriteTask(taskId!),
    onSuccess: async () => {
      setSelectedCandidateIds({});
      if (taskId) {
        await queryClient.invalidateQueries({ queryKey: ["rewrite-task", taskId] });
      }
      await invalidateRewriteRelatedQueries();
    }
  });

  const manualEditMutation = useMutation({
    mutationFn: () =>
      api.manualEditCandidate(currentCandidate!.candidateId, {
        rewrittenText: manualText,
        explanation: "用户手动微调后的改写内容。"
      }),
    onSuccess: async () => {
      setManualEditOpen(false);
      if (taskId) {
        await queryClient.invalidateQueries({ queryKey: ["rewrite-task", taskId] });
      }
      await invalidateRewriteRelatedQueries();
    }
  });

  const recheckMutation = useMutation({
    mutationFn: () => api.createRecheckTask({ docId, segmentIds: acceptedSegmentIds }),
    onSuccess: async (result) => {
      let next = await api.getRecheckTask(result.taskId);
      for (let index = 0; index < 30; index += 1) {
        if (next.status === "done" || next.status === "failed") {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
        next = await api.getRecheckTask(result.taskId);
      }
      setRecheckResult(next);
      setRecheckModalOpen(true);
    }
  });

  useEffect(() => {
    if (taskIdFromQuery && taskIdFromQuery !== taskId) {
      setTaskId(taskIdFromQuery);
    }
  }, [taskIdFromQuery, taskId]);

  useEffect(() => {
    if (
      !taskId &&
      segmentIds.length > 0 &&
      !createTaskMutation.isPending &&
      !createTaskMutation.isSuccess &&
      !createTaskMutation.isError
    ) {
      createTaskMutation.mutate();
    }
  }, [segmentIds, taskId, createTaskMutation]);

  useEffect(() => {
    if (!segmentIds.length) {
      setCurrentSegmentIndex(0);
      return;
    }

    setCurrentSegmentIndex((current) =>
      Math.min(Math.max(current, 0), Math.max(segmentIds.length - 1, 0))
    );
  }, [searchKey, segmentIds.length]);

  useEffect(() => {
    if (!focusSegmentId || !segmentIds.length) {
      return;
    }

    const nextIndex = segmentIds.findIndex((segmentId) => segmentId === focusSegmentId);
    if (nextIndex >= 0) {
      setCurrentSegmentIndex(nextIndex);
    }
  }, [focusSegmentId, searchKey]);

  const groupedCandidates = useMemo(() => {
    const grouped = new Map<string, RewriteCandidate[]>();
    for (const candidate of rewriteTaskQuery.data?.candidates ?? []) {
      const current = grouped.get(candidate.segmentId) ?? [];
      current.push(candidate);
      grouped.set(candidate.segmentId, current);
    }
    return grouped;
  }, [rewriteTaskQuery.data?.candidates]);

  const paragraphOrderMap = useMemo(
    () =>
      new Map((documentQuery.data?.paragraphs ?? []).map((item) => [item.segmentId, item.order])),
    [documentQuery.data?.paragraphs]
  );

  const currentSegmentId = segmentIds[currentSegmentIndex] ?? "";
  const currentParagraph = documentQuery.data?.paragraphs.find(
    (paragraph) => paragraph.segmentId === currentSegmentId
  );
  const currentCandidates = groupedCandidates.get(currentSegmentId) ?? [];
  const acceptedCandidate = currentCandidates.find((candidate) => candidate.accepted);
  const currentCandidate =
    currentCandidates.find(
      (candidate) => candidate.candidateId === selectedCandidateIds[currentSegmentId]
    ) ??
    acceptedCandidate ??
    currentCandidates[currentCandidates.length - 1];
  const rollbackTargetCandidate = acceptedCandidate ?? currentCandidate;
  const acceptedSegmentIds = segmentIds.filter((segmentId) =>
    (groupedCandidates.get(segmentId) ?? []).some((candidate) => candidate.accepted)
  );
  const processedSegments = acceptedSegmentIds.length;
  const isLastSegment = segmentIds.length > 0 && currentSegmentIndex === segmentIds.length - 1;
  const canGoPrev = currentSegmentIndex > 0;
  const canGoNext = currentSegmentIndex < segmentIds.length - 1;
  const currentDisplayText =
    acceptedCandidate?.rewrittenText ??
    currentParagraph?.currentText ??
    currentParagraph?.text ??
    "";
  const showTaskLoading =
    createTaskMutation.isPending ||
    rewriteTaskQuery.data?.status === "pending" ||
    rewriteTaskQuery.data?.status === "running";

  useEffect(() => {
    if (currentCandidate) {
      setManualText(currentCandidate.rewrittenText);
    } else {
      setManualText("");
    }
  }, [currentCandidate?.candidateId]);

  const handleBack = () => {
    if (from === "report" && reportTaskId) {
      navigate(`/reports/${reportTaskId}`);
      return;
    }

    navigate("/rewrite");
  };

  const handleSaveAndExit = async () => {
    if (taskId) {
      await queryClient.invalidateQueries({ queryKey: ["rewrite-task", taskId] });
    }
    await invalidateRewriteRelatedQueries();
    navigate("/rewrite");
  };

  const handleMoveSegment = (direction: -1 | 1) => {
    setCurrentSegmentIndex((current) => {
      const next = current + direction;
      if (next < 0) {
        return 0;
      }
      if (next >= segmentIds.length) {
        return Math.max(segmentIds.length - 1, 0);
      }
      return next;
    });
  };

  return (
    <>
      <PageHeader
        title="学术论文对比改写"
        description="逐段比较原文和改写稿，人工决定采纳、回退和再次改写。"
        actions={
          <>
            <button
              onClick={handleBack}
              className="inline-flex items-center gap-2 rounded-2xl border border-border bg-white px-5 py-3 text-sm font-semibold"
            >
              <ArrowLeft className="h-4 w-4" />
              {from === "report" && reportTaskId ? "返回检测报告" : "返回改写平台"}
            </button>
            <button
              onClick={() => retryMutation.mutate()}
              disabled={!taskId || retryMutation.isPending}
              className="rounded-2xl border border-border bg-white px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              重新生成
            </button>
            <button
              onClick={() => recheckMutation.mutate()}
              disabled={acceptedSegmentIds.length === 0 || recheckMutation.isPending}
              className="rounded-2xl bg-primary-500 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {recheckMutation.isPending ? "复检中..." : "发起复检"}
            </button>
          </>
        }
      />

      {documentQuery.isError ? (
        <EmptyState
          title="论文详情加载失败"
          description="当前无法读取论文内容，请确认后端服务已启动，然后刷新页面重试。"
        />
      ) : null}

      {createTaskMutation.isError || rewriteTaskQuery.isError ? (
        <EmptyState
          title="改写任务加载失败"
          description="当前无法创建或读取改写任务，请确认后端服务已启动，然后刷新页面重试。"
        />
      ) : null}

      {segmentIds.length === 0 ? (
        <EmptyState
          title="没有可改写的段落"
          description="请先从检测报告里选择高风险段落，再进入改写流程。"
        />
      ) : !documentQuery.isError && !rewriteTaskQuery.isError && !createTaskMutation.isError ? (
        <>
          <div className="mb-6 rounded-3xl border border-border bg-white p-5 shadow-soft">
            <div className="flex flex-wrap items-center gap-4 text-sm text-text-600">
              <span>改写策略：均衡化</span>
              <span>学术语气：学术风</span>
              <span>
                当前已处理进度：{processedSegments}/{segmentIds.length} 段
              </span>
              <span>剩余风险点：{Math.max(segmentIds.length - processedSegments, 0)} 个</span>
            </div>
          </div>

          {showTaskLoading ? (
            <div className="mb-6 rounded-3xl border border-border bg-white p-6 shadow-soft">
              <p className="text-lg font-semibold">改写任务生成中...</p>
              <div className="mt-4 h-3 rounded-full bg-slate-200">
                <div
                  className="h-3 rounded-full bg-primary-500 transition-all"
                  style={{ width: `${rewriteTaskQuery.data?.progress ?? 15}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-text-600">
                当前进度 {rewriteTaskQuery.data?.progress ?? 15}%
              </p>
              <div className="mt-4 rounded-2xl border border-primary-50 bg-primary-50/60 px-4 py-3 text-sm text-primary-600">
                改写涉及多段生成时会更耗时，你可以先继续浏览其他内容，任务会在后台持续执行。
              </div>
            </div>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-3xl border border-border bg-white p-6 shadow-soft">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold">原文风险段落</h2>
                <RiskTag
                  label={`段落 ${currentSegmentIndex + 1}/${segmentIds.length}`}
                  tone="warning"
                />
              </div>
              {currentParagraph ? (
                <>
                  <div className="mb-4 flex flex-wrap gap-2">
                    <RiskTag
                      label={`当前版本 v${documentQuery.data?.version ?? 1}`}
                      tone="safe"
                    />
                    <RiskTag
                      label={acceptedCandidate ? "已采纳改写" : "待采纳"}
                      tone={acceptedCandidate ? "safe" : "warning"}
                    />
                  </div>
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-border bg-slate-50/70 p-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-600">
                        原始文本
                      </p>
                      <p className="leading-8 text-text-900">{currentParagraph.text}</p>
                    </div>
                    {acceptedCandidate ? (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-success">
                          当前已采纳内容
                        </p>
                        <p className="leading-8 text-text-900">{currentDisplayText}</p>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="text-sm text-text-600">当前段落不存在，请返回上一页重新进入。</p>
              )}
            </div>

            <div className="rounded-3xl border border-border bg-white p-6 shadow-soft">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">AI 改写建议</h2>
                <div className="flex flex-wrap gap-2">
                  <RiskTag
                    label={
                      currentCandidate
                        ? `预计风险降低至 ${currentCandidate.afterScore}%`
                        : "等待改写结果"
                    }
                    tone="mixed"
                  />
                  {acceptedCandidate ? <RiskTag label="当前已采纳" tone="safe" /> : null}
                </div>
              </div>

              {currentCandidate ? (
                <>
                  {currentCandidates.length > 1 ? (
                    <div className="mb-4 flex flex-wrap gap-2">
                      {currentCandidates.map((candidate, index) => (
                        <button
                          key={candidate.candidateId}
                          onClick={() =>
                            setSelectedCandidateIds((current) => ({
                              ...current,
                              [currentSegmentId]: candidate.candidateId
                            }))
                          }
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                            candidate.candidateId === currentCandidate.candidateId
                              ? "border-primary-500 bg-primary-50 text-primary-600"
                              : "border-border bg-white text-text-600"
                          }`}
                        >
                          候选 {index + 1}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <p className="rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-text-600">
                    {currentCandidate.explanation}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <RiskTag label={`改写前 ${currentCandidate.beforeScore}%`} tone="warning" />
                    <RiskTag label={`改写后 ${currentCandidate.afterScore}%`} tone="safe" />
                  </div>
                  <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
                    <p className="leading-8 text-text-900">{currentCandidate.rewrittenText}</p>
                  </div>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button
                      onClick={() => acceptMutation.mutate(currentCandidate.candidateId)}
                      disabled={currentCandidate.accepted || acceptMutation.isPending}
                      className="rounded-2xl bg-primary-500 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {currentCandidate.accepted ? "已采纳" : "采纳建议"}
                    </button>
                    <button
                      onClick={() =>
                        rollbackTargetCandidate &&
                        rollbackMutation.mutate(rollbackTargetCandidate.candidateId)
                      }
                      disabled={!rollbackTargetCandidate?.accepted || rollbackMutation.isPending}
                      className="rounded-2xl border border-border bg-white px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      回退到原文
                    </button>
                    <button
                      onClick={() => retryMutation.mutate()}
                      disabled={!taskId || retryMutation.isPending}
                      className="rounded-2xl border border-border bg-white px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      换一批
                    </button>
                    <button
                      onClick={() => setManualEditOpen(true)}
                      disabled={!currentCandidate}
                      className="rounded-2xl border border-border bg-white px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      手动微调
                    </button>
                  </div>
                </>
              ) : (
                <EmptyState
                  title="等待改写结果"
                  description="系统正在根据当前风险段生成候选版本，稍后会自动刷新。"
                />
              )}
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between rounded-3xl border border-border bg-white p-5 shadow-soft">
            <div className="flex items-center gap-3 text-sm text-text-600">
              <ArrowLeftRight className="h-4 w-4 text-primary-500" />
              {segmentIds.length > 1
                ? `当前处理第 ${currentSegmentIndex + 1} 段，共 ${segmentIds.length} 段`
                : "当前仅选中了 1 个高风险段，处理完成后可直接保存并退出"}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => handleMoveSegment(-1)}
                disabled={!canGoPrev}
                className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                上一段
              </button>
              <button
                onClick={() => handleMoveSegment(1)}
                disabled={!canGoNext}
                className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                下一段
              </button>
              {isLastSegment ? (
                <button
                  onClick={() => {
                    void handleSaveAndExit();
                  }}
                  className="rounded-2xl bg-primary-500 px-4 py-2 text-sm font-semibold text-white"
                >
                  保存并退出
                </button>
              ) : null}
            </div>
          </div>

          {manualEditOpen && currentCandidate ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4">
              <div className="w-full max-w-3xl rounded-[28px] bg-white p-6 shadow-2xl">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-semibold">手动微调</h3>
                    <p className="mt-2 text-sm text-text-600">
                      你可以直接修改当前改写建议，保存后会写回当前候选版本。
                    </p>
                  </div>
                  <button
                    onClick={() => setManualEditOpen(false)}
                    className="rounded-full border border-border p-2"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-6 grid gap-4">
                  <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-text-600">
                    原文：{currentParagraph?.text ?? "暂无原文"}
                  </div>
                  <textarea
                    value={manualText}
                    onChange={(event) => setManualText(event.target.value)}
                    rows={10}
                    className="w-full rounded-2xl border border-border px-4 py-3 text-sm leading-7 outline-none transition focus:border-primary-500"
                  />
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    onClick={() => setManualEditOpen(false)}
                    className="rounded-2xl border border-border px-5 py-3 text-sm font-semibold"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => manualEditMutation.mutate()}
                    disabled={!manualText.trim() || manualEditMutation.isPending}
                    className="rounded-2xl bg-primary-500 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    保存微调
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {recheckModalOpen && recheckResult ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4">
              <div className="w-full max-w-2xl rounded-[28px] bg-white p-6 shadow-2xl">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-semibold">复检结果</h3>
                    <p className="mt-2 text-sm text-text-600">
                      以下结果基于当前已采纳段落重新检测得出。
                    </p>
                  </div>
                  <button
                    onClick={() => setRecheckModalOpen(false)}
                    className="rounded-full border border-border p-2"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {recheckResult.status === "done" ? (
                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
                      <p className="text-sm font-medium text-text-600">查重率变化</p>
                      <p className="mt-3 text-2xl font-semibold text-warning">
                        {recheckResult.beforeScores.plagiarism ?? 0}% →{" "}
                        {recheckResult.afterScores.plagiarism ?? 0}%
                      </p>
                    </div>
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
                      <p className="text-sm font-medium text-text-600">AIGC 风险变化</p>
                      <p className="mt-3 text-2xl font-semibold text-success">
                        {recheckResult.beforeScores.aigc ?? 0}% →{" "}
                        {recheckResult.afterScores.aigc ?? 0}%
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-5 md:col-span-2">
                      <p className="text-sm font-medium text-text-600">已生效段落</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {recheckResult.changedSegments.length > 0 ? (
                          recheckResult.changedSegments.map((segmentId) => (
                            <RiskTag
                              key={segmentId}
                              label={`段落 ${paragraphOrderMap.get(segmentId) ?? segmentId}`}
                              tone="safe"
                            />
                          ))
                        ) : (
                          <span className="text-sm text-text-600">暂无已生效段落</span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 rounded-2xl border border-red-200 bg-red-50/70 p-5">
                    <p className="text-sm font-medium text-danger">复检失败</p>
                    <p className="mt-3 text-sm leading-7 text-text-600">
                      {recheckResult.errorMessage || "复检任务执行失败，请稍后重试。"}
                    </p>
                  </div>
                )}

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setRecheckModalOpen(false)}
                    className="rounded-2xl bg-primary-500 px-5 py-3 text-sm font-semibold text-white"
                  >
                    确定
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
