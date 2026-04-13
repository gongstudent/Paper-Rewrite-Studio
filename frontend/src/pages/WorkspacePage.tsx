import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  FilePlus2,
  FlaskConical,
  FolderOpen,
  Layers3,
  ShieldAlert,
  Sparkles,
  Upload
} from "lucide-react";
import { api } from "../app/api";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { RiskTag } from "../components/RiskTag";
import { StatCard } from "../components/StatCard";
import { TaskTable } from "../components/TaskTable";
import { UploadDialog } from "../components/UploadDialog";

export function WorkspacePage() {
  const navigate = useNavigate();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [historyTab, setHistoryTab] = useState<"detection" | "rewrite">("detection");

  const navigateToNextStep = (document: {
    docId: string;
    latestDetectionTaskId?: string | null;
  }) => {
    if (document.latestDetectionTaskId) {
      navigate(`/reports/${document.latestDetectionTaskId}`);
      return;
    }

    navigate(`/documents/${document.docId}`);
  };

  const overviewQuery = useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: api.getOverview
  });
  const recentDocumentsQuery = useQuery({
    queryKey: ["dashboard", "recent-documents"],
    queryFn: api.getRecentDocuments
  });
  const activeTaskQuery = useQuery({
    queryKey: ["dashboard", "active-task"],
    queryFn: api.getActiveTask,
    refetchInterval: 3000,
    retry: false
  });
  const taskHistoryQuery = useQuery({
    queryKey: ["dashboard", "task-history", historyTab],
    queryFn: () => api.getTaskHistory(historyTab)
  });

  const overview = overviewQuery.data;
  const recentDocuments = recentDocumentsQuery.data?.items ?? [];
  const activeTask = activeTaskQuery.data;
  const taskHistory = taskHistoryQuery.data?.items ?? [];
  const latestDocument = recentDocuments[0];

  const handleActiveTaskClick = () => {
    if (!activeTask) {
      return;
    }

    if (activeTask.route) {
      navigate(activeTask.route);
      return;
    }

    if (activeTask.taskType === "detection") {
      navigate(`/reports/${activeTask.taskId}`);
      return;
    }

    if (activeTask.taskType === "rewrite" && activeTask.docId) {
      navigate(`/rewrite/${activeTask.docId}`);
      return;
    }

    if (activeTask.docId) {
      navigate(`/documents/${activeTask.docId}`);
    }
  };

  const recommendation = activeTask
    ? {
        title: "继续当前任务",
        description: `当前有一个活跃任务正在进行，建议先回到任务详情继续处理，避免在多个页面之间来回切换。`,
        actionLabel: "查看当前任务",
        onClick: handleActiveTaskClick
      }
    : latestDocument?.latestDetectionTaskId
      ? {
          title: "优先处理最近一篇论文",
          description: `《${latestDocument.title}》已经生成检测结果，建议继续查看报告、进入改写，或在“我的论文”中导出最终稿。`,
          actionLabel: "查看最近报告",
          onClick: () => navigate(`/reports/${latestDocument.latestDetectionTaskId}`)
        }
      : latestDocument
        ? {
            title: "先确认排除范围",
            description: `《${latestDocument.title}》已经上传完成，建议先检查封面、目录、参考文献和附录排除范围，再发起检测。`,
            actionLabel: "去设置排除范围",
            onClick: () => navigate(`/documents/${latestDocument.docId}?focus=exclusions`)
          }
        : {
            title: "从上传第一篇论文开始",
            description: "上传后系统会自动解析结构，并引导你进入排除范围、检测、改写和导出流程。",
            actionLabel: "上传论文",
            onClick: () => setUploadOpen(true)
          };

  return (
    <>
      <PageHeader
        title="论文工作台"
        description="上传论文、检测风险、逐段改写并复检"
        actions={
          <>
            <button
              onClick={() => setUploadOpen(true)}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary-500 px-5 py-3 text-sm font-semibold text-white"
            >
              <Upload className="h-4 w-4" />
              上传新论文
            </button>
            <button
              onClick={() => navigate("/models")}
              className="rounded-2xl border border-border bg-white px-5 py-3 text-sm font-semibold"
            >
              进入模型配置
            </button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="论文总数"
          value={overview?.paperCount ?? 0}
          icon={<FolderOpen className="h-5 w-5" />}
        />
        <StatCard
          label="高风险段落"
          value={overview?.highRiskSegments ?? 0}
          icon={<ShieldAlert className="h-5 w-5" />}
          tone="danger"
        />
        <StatCard
          label="今日检测任务"
          value={overview?.todayDetectionTasks ?? 0}
          icon={<BarChart3 className="h-5 w-5" />}
        />
        <StatCard
          label="今日改写采纳率"
          value={`${overview?.todayRewriteAcceptRate ?? 0}%`}
          icon={<Sparkles className="h-5 w-5" />}
          tone="aigc"
        />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,2fr)_320px]">
        <div className="space-y-6">
          {recentDocuments.length === 0 ? (
            <div className="overflow-hidden rounded-[32px] border border-border bg-white shadow-soft">
              <div className="bg-gradient-to-r from-primary-50 via-white to-rose-50 px-8 py-8">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                  <div className="max-w-2xl">
                    <div className="mb-4 inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-primary-600 shadow-sm">
                      单人论文工作区
                    </div>
                    <h2 className="text-3xl font-semibold tracking-tight">
                      还没有论文项目，先上传第一篇稿件
                    </h2>
                    <p className="mt-3 text-sm leading-7 text-text-600">
                      上传后系统会自动完成结构解析、风险检测和逐段改写准备，你可以从这里直接进入完整流程。
                    </p>
                  </div>
                  <div className="rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-soft">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-500">
                      <Layers3 className="h-7 w-7" />
                    </div>
                    <p className="text-sm text-text-600">推荐格式</p>
                    <p className="mt-1 text-base font-semibold">txt / docx / pdf</p>
                    <button
                      onClick={() => setUploadOpen(true)}
                      className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-primary-500 px-5 py-3 text-sm font-semibold text-white"
                    >
                      <FilePlus2 className="h-4 w-4" />
                      上传第一篇论文
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-border bg-white p-6 shadow-soft">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-xl font-semibold">近期论文</h2>
                <button
                  onClick={() => navigate("/documents")}
                  className="text-sm font-medium text-primary-500"
                >
                  查看全部
                </button>
              </div>

              <div className="space-y-4">
                {recentDocuments.map((document) => (
                  <div
                    key={document.docId}
                    className="rounded-3xl border border-border bg-slate-50/60 p-5"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold">{document.title}</h3>
                        <p className="mt-2 text-sm text-text-600">
                          最近更新：{new Date(document.updatedAt).toLocaleString("zh-CN")} · 版本 v
                          {document.version}
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
                          <RiskTag
                            label={document.status}
                            tone={document.status === "ready" ? "safe" : "warning"}
                          />
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={() => navigate(`/documents/${document.docId}`)}
                          className="rounded-2xl border border-border bg-white px-4 py-2 text-sm font-semibold"
                        >
                          查看详情
                        </button>
                        <button
                          onClick={() => navigateToNextStep(document)}
                          className="rounded-2xl bg-primary-500 px-4 py-2 text-sm font-semibold text-white"
                        >
                          继续处理
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">历史任务</h2>
              <div className="inline-flex rounded-2xl border border-border bg-white p-1 shadow-soft">
                {[
                  ["detection", "检测任务"],
                  ["rewrite", "改写任务"]
                ].map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setHistoryTab(value as "detection" | "rewrite")}
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                      historyTab === value ? "bg-primary-500 text-white" : "text-text-600"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <TaskTable items={taskHistory} />
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-border bg-white p-6 shadow-soft">
            <h2 className="mb-4 text-xl font-semibold">快捷操作</h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setUploadOpen(true)}
                className="rounded-2xl border border-border bg-slate-50 px-4 py-6 text-sm font-semibold"
              >
                上传论文
              </button>
              <button
                onClick={() =>
                  recentDocuments[0] && navigate(`/documents/${recentDocuments[0].docId}`)
                }
                className="rounded-2xl border border-border bg-slate-50 px-4 py-6 text-sm font-semibold"
              >
                开始检测
              </button>
              <button
                onClick={() => recentDocuments[0] && navigateToNextStep(recentDocuments[0])}
                className="rounded-2xl border border-border bg-slate-50 px-4 py-6 text-sm font-semibold"
              >
                高风险改写
              </button>
              <button
                onClick={() => navigate("/models")}
                className="rounded-2xl border border-border bg-slate-50 px-4 py-6 text-sm font-semibold"
                >
                  模型配置
                </button>
              </div>
            <div className="mt-4 rounded-2xl border border-border bg-slate-50/80 p-4">
              <p className="text-sm font-semibold">{recommendation.title}</p>
              <p className="mt-2 text-sm leading-7 text-text-600">{recommendation.description}</p>
              <button
                onClick={recommendation.onClick}
                className="mt-4 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white"
              >
                {recommendation.actionLabel}
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-white p-6 shadow-soft">
            <div className="mb-3 flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-primary-500" />
              <h2 className="text-lg font-semibold">当前活跃任务</h2>
            </div>
            {activeTask ? (
              <button onClick={handleActiveTaskClick} className="block w-full text-left">
                <p className="text-sm font-medium">{activeTask.taskName}</p>
                <p className="mt-2 text-sm text-text-600">{activeTask.elapsedText}</p>
                <div className="mt-4 h-2 rounded-full bg-slate-200">
                  <div
                    className="h-2 rounded-full bg-primary-500"
                    style={{ width: `${activeTask.progress}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-sm text-text-600">
                  <span>{activeTask.status}</span>
                  <span>{activeTask.progress}%</span>
                </div>
                <p className="mt-3 text-xs text-primary-600">点击查看任务详情</p>
              </button>
            ) : (
              <p className="text-sm text-text-600">当前没有活跃任务，可以从上传论文开始。</p>
            )}
          </div>
        </div>
      </div>

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={(id) => navigate(`/documents/${id}?focus=exclusions`)}
      />
    </>
  );
}
