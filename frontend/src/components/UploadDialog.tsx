import { useMemo, useState } from "react";
import { FileUp, LoaderCircle, Sparkles, X } from "lucide-react";
import { api, uploadDocument } from "../app/api";

type UploadDialogProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: (docId: string) => void;
};

export function UploadDialog({ open, onClose, onSuccess }: UploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState("zh-CN");
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<"idle" | "uploading" | "parsing" | "failed">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);

  const uploading = stage === "uploading" || stage === "parsing";
  const canSubmit = useMemo(() => !!file && !uploading, [file, uploading]);

  if (!open) {
    return null;
  }

  const handleSubmit = async () => {
    if (!file) return;
    setStage("uploading");
    setError(null);
    try {
      const response = await uploadDocument(file, title || file.name, language, setProgress);
      setProgress(100);
      setStage("parsing");

      await api.parseDocument(response.docId);

      let ready = false;
      for (let index = 0; index < 24; index += 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const document = await api.getDocument(response.docId);
        if (document.status === "ready") {
          ready = true;
          break;
        }
        if (document.status === "error") {
          throw new Error(document.parseError || "论文解析失败");
        }
      }

      if (!ready) {
        throw new Error("解析超时，请稍后在论文详情页继续查看");
      }

      onClose();
      onSuccess(response.docId);
      setFile(null);
      setTitle("");
      setProgress(0);
      setStage("idle");
    } catch (submitError) {
      setStage("failed");
      setError(submitError instanceof Error ? submitError.message : "上传失败");
    }
  };

  const stageTitle =
    stage === "uploading"
      ? "正在上传论文"
      : stage === "parsing"
        ? "正在解析论文结构"
        : "上传论文";

  const stageDescription =
    stage === "uploading"
      ? "文件已进入上传流程，请稍候。"
      : stage === "parsing"
        ? "论文已上传完成，系统正在分段、识别结构，完成后将进入排除范围设置。"
        : "支持 txt、docx、pdf，上传后会进入解析和结构化流程。";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4">
      <div className="w-full max-w-2xl rounded-[28px] bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-2xl font-semibold">{stageTitle}</h3>
            <p className="mt-2 text-sm text-text-600">{stageDescription}</p>
          </div>
          <button onClick={onClose} className="rounded-full border border-border p-2">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 grid gap-4">
          <label className="grid gap-2">
            <span className="text-sm font-medium">论文标题</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="rounded-2xl border border-border px-4 py-3 outline-none transition focus:border-primary-500"
              placeholder="输入论文标题"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">语言</span>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              className="rounded-2xl border border-border px-4 py-3 outline-none transition focus:border-primary-500"
            >
              <option value="zh-CN">中文论文</option>
              <option value="en-US">英文论文</option>
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">选择文件</span>
            <div className="rounded-3xl border border-dashed border-border bg-slate-50/80 p-6">
              <div className="flex flex-col items-center justify-center text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-500">
                  <FileUp className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium">
                  拖拽论文到此处，或点击下方选择文件
                </p>
                <p className="mt-1 text-xs text-text-600">
                  推荐优先使用 txt、docx，pdf 也可解析
                </p>
              </div>
              <input
                type="file"
                accept=".txt,.docx,.pdf"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="mt-4 w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm"
              />
            </div>
          </label>

          {file ? (
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="flex items-center justify-between text-sm">
                <span>{file.name}</span>
                <span>{stage === "parsing" ? "解析中" : `${progress}%`}</span>
              </div>
              <div className="mt-3 h-2 rounded-full bg-slate-200">
                <div
                  className="h-2 rounded-full bg-primary-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {stage === "parsing" ? (
                <div className="mt-3 flex items-center gap-2 text-xs text-text-600">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  正在识别章节、段落与排除区间
                </div>
              ) : null}
            </div>
          ) : null}

          {stage === "failed" && error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          ) : null}

          {stage === "idle" ? (
            <div className="rounded-2xl bg-primary-50/70 px-4 py-3 text-xs text-text-600">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary-500" />
                上传后会自动解析，并在完成后直接进入“排除范围”设置页。
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-2xl border border-border px-5 py-3 text-sm font-medium"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-2xl bg-primary-500 px-5 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {stage === "uploading"
              ? "上传中..."
              : stage === "parsing"
                ? "解析中..."
                : "开始上传"}
          </button>
        </div>
      </div>
    </div>
  );
}
