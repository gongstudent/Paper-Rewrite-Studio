import type {
  ActiveTask,
  ApiResponse,
  DetectionSummary,
  DetectionTask,
  DocumentSummary,
  ExportTask,
  HelpPayload,
  ModelProvider,
  NotificationItem,
  PaperDocument,
  RecheckResult,
  RewriteTask,
  SearchPayload,
  TaskHistoryItem,
  WorkspaceOverview,
  AppSettings
} from "./types";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3100";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  const payload = (await response.json()) as ApiResponse<T>;
  if (!response.ok || payload.code !== 0) {
    throw new Error(payload.message || "请求失败");
  }

  return payload.data;
}

function normalizeProvider(raw: any): ModelProvider {
  return {
    ...raw,
    capabilities:
      typeof raw.capabilities === "string"
        ? raw.capabilities.split(",").filter(Boolean)
        : raw.capabilities ?? []
  };
}

function normalizeHelpPayload(raw: any): HelpPayload {
  const items = Array.isArray(raw?.items) ? raw.items : [];
  const workflow = Array.isArray(raw?.workflow)
    ? raw.workflow
    : [
        {
          id: "fallback-upload",
          title: "1. 上传论文",
          description: "在工作台上传论文后，系统会自动进入解析流程。"
        },
        {
          id: "fallback-detect",
          title: "2. 确认排除并发起检测",
          description: "在论文详情页确认排除范围后，再开始检测与后续改写。"
        }
      ];
  const warnings = Array.isArray(raw?.warnings)
    ? raw.warnings
    : [
        "当前帮助内容来自兼容模式。若你刚更新了项目但后端还没重启，建议重启 backend 后再查看完整帮助页。"
      ];

  return {
    workflow,
    items,
    warnings,
    contact: {
      channel: raw?.contact?.channel ?? "本地单人使用",
      note:
        raw?.contact?.note ??
        "当前版本为本地工作台，不接入在线客服。遇到问题可优先查看 Swagger、控制台输出和项目文档。",
      docs: Array.isArray(raw?.contact?.docs) ? raw.contact.docs : ["README.md"]
    }
  };
}

export function uploadDocument(
  file: File,
  title: string,
  language: string,
  onProgress?: (progress: number) => void
) {
  return new Promise<{
    docId: string;
    title: string;
    sourceFile: { name: string; type: string };
    version: number;
  }>((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title);
    formData.append("language", language);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}/api/documents/upload`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onerror = () => reject(new Error("上传失败"));
    xhr.onload = () => {
      try {
        const payload = JSON.parse(xhr.responseText) as ApiResponse<any>;
        if (xhr.status >= 400 || payload.code !== 0) {
          reject(new Error(payload.message || "上传失败"));
          return;
        }
        resolve(payload.data);
      } catch (error) {
        reject(error);
      }
    };
    xhr.send(formData);
  });
}

export const api = {
  getOverview: () => request<WorkspaceOverview>("/api/dashboard/overview"),
  getRecentDocuments: async () =>
    request<{ items: DocumentSummary[] }>("/api/dashboard/recent-documents"),
  getActiveTask: () => request<ActiveTask>("/api/dashboard/active-task"),
  getTaskHistory: (tab: "detection" | "rewrite") =>
    request<{ items: TaskHistoryItem[] }>(`/api/dashboard/task-history?tab=${tab}`),
  search: (query: string) =>
    request<SearchPayload>(`/api/search?q=${encodeURIComponent(query)}`),
  getNotifications: () =>
    request<{ items: NotificationItem[] }>("/api/notifications"),
  getHelp: async () => {
    const payload = await request<any>("/api/help");
    return normalizeHelpPayload(payload);
  },
  getSettings: () => request<AppSettings>("/api/settings"),
  saveSettings: (payload: Partial<AppSettings>) =>
    request<AppSettings>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  listDocuments: () => request<{ items: DocumentSummary[] }>("/api/documents"),
  deleteDocument: (docId: string) =>
    request<{ success: boolean; docId: string }>(`/api/documents/${docId}`, {
      method: "DELETE"
    }),
  getDocument: (docId: string) => request<PaperDocument>(`/api/documents/${docId}`),
  parseDocument: (docId: string) =>
    request<{ taskId: string; status: string }>(`/api/documents/${docId}/parse`, {
      method: "POST"
    }),
  saveExclusions: (
    docId: string,
    payload: PaperDocument["exclusions"]
  ) =>
    request<PaperDocument>(`/api/documents/${docId}/exclusions`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  listProviders: async () => {
    const providers = await request<any[]>("/api/model-providers");
    return providers.map(normalizeProvider);
  },
  createProvider: async (payload: Omit<ModelProvider, "providerId" | "status">) => {
    const provider = await request<any>("/api/model-providers", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    return normalizeProvider(provider);
  },
  updateProvider: async (
    providerId: string,
    payload: Partial<Omit<ModelProvider, "providerId" | "status">>
  ) => {
    const provider = await request<any>(`/api/model-providers/${providerId}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    return normalizeProvider(provider);
  },
  deleteProvider: (providerId: string) =>
    request<{ success: boolean }>(`/api/model-providers/${providerId}`, {
      method: "DELETE"
    }),
  testProvider: (providerId: string) =>
    request<{ status: string; latencyMs: number; message: string }>(
      `/api/model-providers/${providerId}/test`,
      {
        method: "POST"
      }
    ),
  previewProvider: (
    providerId: string,
    payload: {
      text: string;
    }
  ) =>
    request<{
      status: string;
      result: string;
      latencyMs: number;
      engine: string;
      tokens: number;
    }>(`/api/model-providers/${providerId}/preview`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  setDefaultProvider: (providerId: string, scene: "rewrite" | "detect") =>
    request<ModelProvider>(`/api/model-providers/${providerId}/set-default`, {
      method: "POST",
      body: JSON.stringify({ scene })
    }),
  setCurrentProjectProvider: (providerId: string) =>
    request<{ providerId: string; currentProviderId: string }>(
      `/api/model-providers/${providerId}/set-current`,
      {
        method: "POST"
      }
    ),
  createDetectionTask: (payload: {
    docId: string;
    taskTypes: Array<"plagiarism" | "aigc">;
    providerId?: string;
  }) =>
    request<{ taskIds: string[]; status: string }>("/api/detection-tasks", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  getDetectionTask: (taskId: string) =>
    request<DetectionTask>(`/api/detection-tasks/${taskId}`),
  getDetectionSummary: (docId: string) =>
    request<DetectionSummary>(`/api/documents/${docId}/detection-summary`),
  createRewriteTask: (payload: {
    docId: string;
    segmentIds: string[];
    strategy: string;
    providerId?: string;
    model?: string;
    options?: Record<string, unknown>;
  }) =>
    request<{ taskId: string; status: string }>("/api/rewrite-tasks", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  getRewriteTask: (taskId: string) =>
    request<RewriteTask>(`/api/rewrite-tasks/${taskId}`),
  acceptCandidate: (candidateId: string) =>
    request<{ candidateId: string; accepted: boolean }>(
      `/api/rewrite-candidates/${candidateId}/accept`,
      { method: "POST" }
    ),
  rollbackCandidate: (candidateId: string) =>
    request<{ candidateId: string; accepted: boolean }>(
      `/api/rewrite-candidates/${candidateId}/rollback`,
      { method: "POST" }
    ),
  manualEditCandidate: (
    candidateId: string,
    payload: {
      rewrittenText: string;
      explanation?: string;
    }
  ) =>
    request<RewriteTask["candidates"][number]>(
      `/api/rewrite-candidates/${candidateId}/manual-edit`,
      {
        method: "POST",
        body: JSON.stringify(payload)
      }
    ),
  retryRewriteTask: (taskId: string) =>
    request<{ taskId: string; status: string }>(`/api/rewrite-tasks/${taskId}/retry`, {
      method: "POST"
    }),
  createRecheckTask: (payload: { docId: string; segmentIds?: string[] }) =>
    request<{ taskId: string; status: string }>("/api/recheck-tasks", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  getRecheckTask: (taskId: string) =>
    request<RecheckResult>(`/api/recheck-tasks/${taskId}`),
  createExportTask: (payload: {
    docId: string;
    exportType: "final_doc" | "diff_report";
  }) =>
    request<{ exportId: string; status: string }>("/api/exports", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  getExportTask: (exportId: string) =>
    request<ExportTask>(`/api/exports/${exportId}`)
};
