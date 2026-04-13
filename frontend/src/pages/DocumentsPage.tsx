import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FileText, Sparkles, X } from "lucide-react";
import { API_BASE_URL, api } from "../app/api";
import type { DocumentSummary } from "../app/types";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { RiskTag } from "../components/RiskTag";

export function DocumentsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [exportingDocId, setExportingDocId] = useState<string | null>(null);
  const [pendingDeleteDocument, setPendingDeleteDocument] = useState<DocumentSummary | null>(null);

  const invalidateDocumentRelatedQueries = async () => {
    await queryClient.invalidateQueries({ queryKey: ["documents", "all"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard", "recent-documents"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard", "active-task"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard", "task-history", "detection"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard", "task-history", "rewrite"] });
  };

  const documentsQuery = useQuery({
    queryKey: ["documents", "all"],
    queryFn: api.listDocuments,
    retry: false
  });

  const deleteMutation = useMutation({
    mutationFn: (docId: string) => api.deleteDocument(docId),
    onSuccess: async () => {
      setDeleteError(null);
      await invalidateDocumentRelatedQueries();
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      setDeleteError(
        `删除论文失败：${message}。如果报错是 404，请先重启 backend，让最新路由生效。`
      );
    }
  });

  const exportMutation = useMutation({
    mutationFn: async (document: DocumentSummary) => {
      const task = await api.createExportTask({
        docId: document.docId,
        exportType: "final_doc"
      });

      for (let index = 0; index < 60; index += 1) {
        const result = await api.getExportTask(task.exportId);

        if (result.status === "done") {
          if (!result.downloadUrl) {
            throw new Error("导出任务已完成，但下载地址为空。");
          }

          return { result, document };
        }

        if (result.status === "failed") {
          throw new Error(result.errorMessage || "导出失败，请稍后重试。");
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      throw new Error("导出处理时间较长，请稍后重试。");
    },
    onMutate: (document) => {
      setExportingDocId(document.docId);
      setExportMessage(null);
    },
    onSuccess: async ({ result, document }) => {
      window.open(`${API_BASE_URL}${result.downloadUrl}`, "_blank");
      await invalidateDocumentRelatedQueries();
      setExportMessage({
        type: "success",
        text: `《${document.title}》导出成功，已按导入格式生成文件（${document.sourceFileType ?? "txt"}）。`
      });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      setExportMessage({
        type: "error",
        text: `导出论文失败：${message}`
      });
    },
    onSettled: () => {
      setExportingDocId(null);
    }
  });

  const documents = documentsQuery.data?.items ?? [];

  const closeDeleteDialog = () => {
    if (deleteMutation.isPending) {
      return;
    }

    setPendingDeleteDocument(null);
  };

  const handleConfirmDelete = () => {
    if (!pendingDeleteDocument || deleteMutation.isPending) {
      return;
    }

    deleteMutation.mutate(pendingDeleteDocument.docId, {
      onSuccess: () => {
        setPendingDeleteDocument(null);
      }
    });
  };

  const getPrimaryAction = (document: (typeof documents)[number]) => {
    if (document.latestDetectionTaskId) {
      return {
        label: "查看报告",
        onClick: () => navigate(`/reports/${document.latestDetectionTaskId}`)
      };
    }

    if (document.status === "ready") {
      return {
        label: "开始检测",
        onClick: () => navigate(`/documents/${document.docId}`)
      };
    }

    if (document.status === "error") {
      return {
        label: "查看问题",
        onClick: () => navigate(`/documents/${document.docId}`)
      };
    }

    return {
      label: "继续处理",
      onClick: () => navigate(`/documents/${document.docId}`)
    };
  };

  const getSecondaryAction = (document: (typeof documents)[number]) => {
    if (document.latestDetectionTaskId) {
      return {
        label: "继续改写",
        onClick: () => navigate(`/reports/${document.latestDetectionTaskId}`)
      };
    }

    return {
      label: "查看详情",
      onClick: () => navigate(`/documents/${document.docId}`)
    };
  };

  return (
    <>
      <PageHeader
        title="我的论文"
        description="查看你已经上传和处理过的论文，继续进入详情、检测报告或改写流程。"
      />

      {deleteError ? (
        <div className="mb-6 rounded-3xl border border-red-200 bg-white p-6 text-sm text-danger shadow-soft">
          {deleteError}
        </div>
      ) : null}
      {exportMessage ? (
        <div
          className={`mb-6 rounded-3xl border bg-white p-6 text-sm shadow-soft ${
            exportMessage.type === "success"
              ? "border-emerald-200 text-success"
              : "border-red-200 text-danger"
          }`}
        >
          {exportMessage.text}
        </div>
      ) : null}

      {documentsQuery.isLoading ? (
        <div className="rounded-3xl border border-border bg-white p-8 text-sm text-text-600 shadow-soft">
          正在加载论文列表...
        </div>
      ) : documentsQuery.isError ? (
        <EmptyState
          title="论文列表加载失败"
          description="当前无法读取论文列表，请确认后端服务已启动，然后刷新页面重试。"
        />
      ) : documents.length === 0 ? (
        <EmptyState
          title="还没有论文"
          description="先从工作台上传论文，上传成功后这里会展示你处理过的全部论文信息。"
        />
      ) : (
        <div className="grid gap-4">
          {documents.map((document) => (
            <div
              key={document.docId}
              className="rounded-3xl border border-border bg-white p-6 shadow-soft"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-500">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold">{document.title}</h2>
                      <p className="mt-1 text-sm text-text-600">
                        {document.sourceFileName ?? "未知文件"} · {document.sourceFileType ?? "未知格式"} ·
                        v{document.version}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm text-text-600">
                    <p>最近更新：{new Date(document.updatedAt).toLocaleString("zh-CN")}</p>
                    <p>语言：{document.language ?? "zh-CN"}</p>
                    {document.parseError ? (
                      <p className="text-danger">异常信息：{document.parseError}</p>
                    ) : null}
                  </div>

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

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => navigate(`/documents/${document.docId}`)}
                    className="rounded-2xl border border-border bg-white px-4 py-2 text-sm font-semibold"
                  >
                    查看详情
                  </button>
                  <button
                    onClick={getPrimaryAction(document).onClick}
                    className="rounded-2xl border border-border bg-white px-4 py-2 text-sm font-semibold"
                  >
                    {getPrimaryAction(document).label}
                  </button>
                  <button
                    onClick={getSecondaryAction(document).onClick}
                    className="inline-flex items-center gap-2 rounded-2xl bg-primary-500 px-4 py-2 text-sm font-semibold text-white"
                  >
                    <Sparkles className="h-4 w-4" />
                    {getSecondaryAction(document).label}
                  </button>
                  <button
                    onClick={() => exportMutation.mutate(document)}
                    disabled={Boolean(exportingDocId) || deleteMutation.isPending}
                    className="rounded-2xl border border-primary-200 bg-primary-50 px-4 py-2 text-sm font-semibold text-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {exportingDocId === document.docId ? "导出中..." : "导出论文"}
                  </button>
                  <button
                    onClick={() => {
                      setDeleteError(null);
                      setPendingDeleteDocument(document);
                    }}
                    disabled={deleteMutation.isPending}
                    className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-danger"
                  >
                    删除论文
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {pendingDeleteDocument ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4"
          onClick={closeDeleteDialog}
        >
          <div
            className="w-full max-w-xl rounded-[28px] border border-border bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-red-50 text-danger">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <h3 className="text-2xl font-semibold">确认删除论文</h3>
                <p className="mt-2 text-sm leading-7 text-text-600">
                  删除后将移除论文记录、解析结果、检测/改写任务及导出文件，此操作不可撤销。
                </p>
              </div>
              <button
                onClick={closeDeleteDialog}
                disabled={deleteMutation.isPending}
                className="rounded-full border border-border p-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50/70 p-4">
              <p className="text-sm font-semibold text-danger">{pendingDeleteDocument.title}</p>
              <p className="mt-1 text-xs text-text-600">
                {pendingDeleteDocument.sourceFileName ?? "未知文件"} ·
                {pendingDeleteDocument.sourceFileType ?? "未知格式"} · v{pendingDeleteDocument.version}
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={closeDeleteDialog}
                disabled={deleteMutation.isPending}
                className="rounded-2xl border border-border px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                取消
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteMutation.isPending}
                className="rounded-2xl bg-danger px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleteMutation.isPending ? "删除中..." : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
