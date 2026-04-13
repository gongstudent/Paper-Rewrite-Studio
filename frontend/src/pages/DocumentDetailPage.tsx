import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { LoaderCircle, PlayCircle, Save } from "lucide-react";
import { api } from "../app/api";
import type { PaperDocument } from "../app/types";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { RiskTag } from "../components/RiskTag";

export function DocumentDetailPage() {
  const { docId = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const parseTriggered = useRef(false);
  const focusHandled = useRef(false);
  const exclusionSectionRef = useRef<HTMLDivElement | null>(null);
  const [exclusions, setExclusions] = useState<PaperDocument["exclusions"] | null>(null);
  const [highlightExclusionSection, setHighlightExclusionSection] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const documentQuery = useQuery({
    queryKey: ["documents", docId],
    queryFn: () => api.getDocument(docId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "parsing" || status === "uploaded" ? 2500 : false;
    }
  });

  const parseMutation = useMutation({
    mutationFn: () => api.parseDocument(docId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["documents", docId] });
    }
  });

  const saveExclusionMutation = useMutation({
    mutationFn: (payload: PaperDocument["exclusions"]) => api.saveExclusions(docId, payload),
    onSuccess: (updated) => {
      setExclusions(updated.exclusions);
      setSaveMessage("排除范围已保存，并已按最新选择重新解析正文结构。");
      void queryClient.setQueryData(["documents", docId], updated);
    }
  });

  const startDetectionMutation = useMutation({
    mutationFn: async () => {
      const latestExclusions = exclusions ?? documentQuery.data?.exclusions;
      if (!latestExclusions) {
        throw new Error("当前排除范围不可用");
      }

      const persisted = documentQuery.data?.exclusions;
      const isDirty =
        JSON.stringify(latestExclusions) !== JSON.stringify(persisted);

      if (isDirty) {
        const updated = await api.saveExclusions(docId, latestExclusions);
        setExclusions(updated.exclusions);
        setSaveMessage("开始检测前已自动同步排除范围。");
        void queryClient.setQueryData(["documents", docId], updated);
      }

      return api.createDetectionTask({
        docId,
        taskTypes: ["plagiarism", "aigc"]
      });
    },
    onSuccess: (result) => {
      navigate(`/reports/${result.taskIds[0]}`);
    }
  });

  useEffect(() => {
    if (!documentQuery.data) return;
    setExclusions((current) => current ?? documentQuery.data.exclusions);
    if (
      !parseTriggered.current &&
      documentQuery.data.status === "uploaded" &&
      documentQuery.data.paragraphs.length === 0
    ) {
      parseTriggered.current = true;
      parseMutation.mutate();
    }
  }, [documentQuery.data, parseMutation]);

  useEffect(() => {
    if (!documentQuery.data || focusHandled.current) {
      return;
    }

    const focusTarget = searchParams.get("focus");
    if (focusTarget !== "exclusions") {
      return;
    }

    focusHandled.current = true;
    exclusionSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
    setHighlightExclusionSection(true);

    const timer = window.setTimeout(() => {
      setHighlightExclusionSection(false);
    }, 1800);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("focus");
    setSearchParams(nextParams, { replace: true });

    return () => {
      window.clearTimeout(timer);
    };
  }, [documentQuery.data, searchParams, setSearchParams]);

  if (!documentQuery.data) {
    return <div className="text-sm text-text-600">加载论文详情中...</div>;
  }

  const document = documentQuery.data;
  const currentExclusions = exclusions ?? document.exclusions;
  const paragraphTypeMap = {
    cover: document.paragraphs.some((paragraph) => paragraph.paragraphType === "cover"),
    catalog: document.paragraphs.some((paragraph) => paragraph.paragraphType === "catalog"),
    references: document.paragraphs.some((paragraph) => paragraph.paragraphType === "references"),
    appendix: document.paragraphs.some((paragraph) => paragraph.paragraphType === "appendix")
  };
  const missingHints = [
    paragraphTypeMap.cover ? null : "封面",
    paragraphTypeMap.catalog ? null : "目录",
    paragraphTypeMap.references ? null : "参考文献",
    paragraphTypeMap.appendix ? null : "附录"
  ].filter(Boolean);

  const isExcludedByCurrentSelection = (paragraphType: string) => {
    if (paragraphType === "cover") return currentExclusions.excludeCover;
    if (paragraphType === "catalog") return currentExclusions.excludeCatalog;
    if (paragraphType === "references") return currentExclusions.excludeReferences;
    if (paragraphType === "appendix") return currentExclusions.excludeAppendix;
    return false;
  };

  const toggleManualExclusion = (segmentId: string) => {
    setExclusions((current) => {
      const base = current ?? document.exclusions;
      const alreadyExcluded = base.manualExcludedSegmentIds.includes(segmentId);

      return {
        ...base,
        manualExcludedSegmentIds: alreadyExcluded
          ? base.manualExcludedSegmentIds.filter((id) => id !== segmentId)
          : [...base.manualExcludedSegmentIds, segmentId]
      };
    });
  };

  const previewParagraphs = document.paragraphs.map((paragraph) => {
    const autoExcluded = isExcludedByCurrentSelection(paragraph.paragraphType);
    const manuallyExcluded = currentExclusions.manualExcludedSegmentIds.includes(
      paragraph.segmentId
    );
    const excluded = autoExcluded || manuallyExcluded;

    return {
      ...paragraph,
      autoExcluded,
      manuallyExcluded,
      previewExcluded: excluded
    };
  });

  const selectedCount = previewParagraphs.filter((paragraph) => !paragraph.previewExcluded).length;
  const manualExcludedCount = previewParagraphs.filter(
    (paragraph) => paragraph.manuallyExcluded
  ).length;
  const isDirty =
    JSON.stringify(currentExclusions) !== JSON.stringify(document.exclusions);

  return (
    <>
      <PageHeader
        title={document.title}
        description="确认解析结果、章节结构与排除范围，然后再进入检测流程。"
        actions={
          <>
            <button
              onClick={() => parseMutation.mutate()}
              className="inline-flex items-center gap-2 rounded-2xl border border-border bg-white px-5 py-3 text-sm font-semibold"
            >
              {parseMutation.isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4" />
              )}
              重新解析
            </button>
            <button
              onClick={() => exclusions && saveExclusionMutation.mutate(exclusions)}
              disabled={!isDirty || saveExclusionMutation.isPending}
              className="inline-flex items-center gap-2 rounded-2xl border border-border bg-white px-5 py-3 text-sm font-semibold"
            >
              <Save className="h-4 w-4" />
              保存排除范围
            </button>
            <button
              onClick={() => startDetectionMutation.mutate()}
              disabled={
                document.status !== "ready" ||
                saveExclusionMutation.isPending ||
                startDetectionMutation.isPending
              }
              className="rounded-2xl bg-primary-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              开始检测
            </button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-border bg-white p-6 shadow-soft">
            <h2 className="text-lg font-semibold">文件信息</h2>
            <div className="mt-4 space-y-3 text-sm text-text-600">
              <p>文件名：{document.sourceFile.name}</p>
              <p>格式：{document.sourceFile.type}</p>
              <p>版本：v{document.version}</p>
              <RiskTag
                label={document.status}
                tone={
                  document.status === "ready"
                    ? "safe"
                    : document.status === "error"
                      ? "high"
                      : "warning"
                }
              />
              {document.parseError ? (
                <p className="text-danger">解析错误：{document.parseError}</p>
              ) : null}
            </div>
          </div>

          <div
            ref={exclusionSectionRef}
            className={`rounded-3xl border bg-white p-6 shadow-soft transition ${
              highlightExclusionSection
                ? "border-primary-500 ring-2 ring-primary-100"
                : "border-border"
            }`}
          >
            <h2 className="text-lg font-semibold">排除范围</h2>
            <div className="mt-4 space-y-3 text-sm">
              {(
                [
                  ["excludeCover", "排除封面", paragraphTypeMap.cover],
                  ["excludeCatalog", "排除目录", paragraphTypeMap.catalog],
                  ["excludeReferences", "排除参考文献", paragraphTypeMap.references],
                  ["excludeAppendix", "排除附录", paragraphTypeMap.appendix]
                ] as Array<
                  [keyof PaperDocument["exclusions"], string, boolean]
                >
              ).map(([key, label, available]) => (
                <label
                  key={key}
                  className={`flex items-center gap-3 ${available ? "" : "opacity-50"}`}
                >
                  <input
                    type="checkbox"
                    disabled={!available}
                    checked={Boolean(currentExclusions[key])}
                    onChange={(event) =>
                      setExclusions((current) => ({
                        ...(current ?? document.exclusions),
                        [key]: event.target.checked
                      }))
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-6 text-text-600">
              可在右侧段落预览中手动排除任意段落。当前手动排除：{manualExcludedCount} 段。
            </div>
            {missingHints.length > 0 ? (
              <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-xs leading-6 text-text-600">
                当前文档未识别到：{missingHints.join("、")}。这些排除项不会生效，若有需要可先调整文档结构或改用更清晰的源文件。
              </div>
            ) : null}
            {saveMessage ? (
              <div className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-xs leading-6 text-success">
                {saveMessage}
              </div>
            ) : null}
            {isDirty ? (
              <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-6 text-text-600">
                当前排除范围尚未保存。点击“保存排除范围”，或直接点击“开始检测”自动同步。
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-white p-6 shadow-soft">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">正文结构与段落预览</h2>
              <p className="mt-1 text-sm text-text-600">
                当前参与检测的段落：{selectedCount} / {previewParagraphs.length}
              </p>
            </div>
          </div>

          {previewParagraphs.length === 0 ? (
            <EmptyState
              title="正在等待解析结果"
              description="上传完成后系统会把论文切分为章节和段落结构，解析结束后你就能在这里确认内容。"
            />
          ) : (
            <div className="space-y-4">
              {previewParagraphs.map((paragraph) => (
                <div
                  key={paragraph.segmentId}
                  className={`rounded-2xl border p-4 ${
                    paragraph.previewExcluded
                      ? "border-amber-200 bg-amber-50/70"
                      : "border-border bg-slate-50/60"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-text-600">
                      段落 #{paragraph.order}
                    </span>
                    <div className="flex items-center gap-2">
                      <RiskTag
                        label={paragraph.previewExcluded ? "不参与检测" : "参与检测"}
                        tone={paragraph.previewExcluded ? "warning" : "safe"}
                      />
                      <button
                        onClick={() => toggleManualExclusion(paragraph.segmentId)}
                        disabled={paragraph.autoExcluded}
                        className={`rounded-xl border px-3 py-1 text-xs font-medium transition ${
                          paragraph.autoExcluded
                            ? "cursor-not-allowed border-amber-200 bg-amber-100 text-text-600"
                            : paragraph.manuallyExcluded
                              ? "border-red-200 bg-red-50 text-danger"
                              : "border-border bg-white text-text-600 hover:border-primary-200 hover:text-primary-600"
                        }`}
                      >
                        {paragraph.autoExcluded
                          ? "规则排除"
                          : paragraph.manuallyExcluded
                            ? "取消手动排除"
                            : "手动排除"}
                      </button>
                    </div>
                  </div>
                  <p className="leading-7 text-text-900">{paragraph.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
