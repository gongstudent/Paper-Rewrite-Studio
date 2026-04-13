export type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
  requestId: string;
};

export type WorkspaceOverview = {
  paperCount: number;
  highRiskSegments: number;
  todayDetectionTasks: number;
  todayRewriteAcceptRate: number;
};

export type DocumentSummary = {
  docId: string;
  title: string;
  language?: string;
  updatedAt: string;
  version: number;
  aigcRiskLevel: "high" | "warning" | "safe";
  plagiarismRiskLevel: "high" | "warning" | "safe";
  status: string;
  sourceFileName?: string;
  sourceFileType?: string;
  latestDetectionTaskId?: string | null;
  latestDetectionStatus?: string | null;
  parseError?: string | null;
};

export type ActiveTask = {
  taskId: string;
  taskName: string;
  taskType: string;
  docId?: string;
  route?: string;
  progress: number;
  elapsedText: string;
  status: string;
} | null;

export type TaskHistoryItem = {
  taskId: string;
  taskName: string;
  paperTitle?: string;
  startedAt: string;
  analysisType: string;
  status: string;
};

export type DocumentSection = {
  sectionId: string;
  docId: string;
  title: string;
  level: number;
  order: number;
};

export type DocumentParagraph = {
  segmentId: string;
  docId: string;
  sectionId: string | null;
  text: string;
  currentText: string | null;
  order: number;
  excluded: boolean;
  paragraphType: string;
};

export type PaperDocument = {
  docId: string;
  title: string;
  language: string;
  version: number;
  status: string;
  parseError?: string | null;
  exclusions: {
    excludeCover: boolean;
    excludeCatalog: boolean;
    excludeReferences: boolean;
    excludeAppendix: boolean;
    manualExcludedSegmentIds: string[];
  };
  sourceFile: {
    name: string;
    type: string;
  };
  sections: DocumentSection[];
  paragraphs: DocumentParagraph[];
  citations: unknown[];
};

export type SegmentResult = {
  segmentId: string;
  originalText: string;
  riskScore: number;
  plagiarismScore?: number | null;
  aigcScore?: number | null;
  riskType: "plagiarism" | "aigc" | "mixed";
  evidence: {
    reason: string;
  };
  suggestedAction: string;
};

export type DetectionTask = {
  taskId: string;
  docId: string;
  taskType: string;
  status: string;
  progress: number;
  createdAt: string;
  finishedAt?: string | null;
  elapsedSeconds: number;
  summaryScore?: number | null;
  plagiarismScore?: number | null;
  aigcScore?: number | null;
  errorMessage?: string | null;
  updatedAt: string;
  includedSegmentIds: string[];
  excludedSegmentIds: string[];
  segmentResults: SegmentResult[];
};

export type DetectionSummary = {
  plagiarismScore: number;
  aigcScore: number;
  highRiskCount: number;
  processedCount: number;
};

export type ModelProvider = {
  providerId: string;
  providerType: "local" | "cloud";
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  capabilities: string[];
  timeoutMs: number;
  concurrency: number;
  contextWindow: number;
  status: string;
  isDefaultRewrite?: boolean;
  isDefaultDetect?: boolean;
  isCurrentProject?: boolean;
};

export type RewriteCandidate = {
  candidateId: string;
  taskId: string;
  segmentId: string;
  rewrittenText: string;
  explanation: string;
  beforeScore: number;
  afterScore: number;
  accepted: boolean;
};

export type RewriteTask = {
  taskId: string;
  docId: string;
  status: string;
  progress: number;
  errorMessage?: string | null;
  updatedAt: string;
  strategy: string;
  segmentIds: string[];
  candidates: RewriteCandidate[];
};

export type RecheckResult = {
  taskId: string;
  status: string;
  progress: number;
  beforeScores: Record<string, number>;
  afterScores: Record<string, number>;
  changedSegments: string[];
  errorMessage?: string | null;
  updatedAt: string;
};

export type ExportTask = {
  exportId: string;
  status: string;
  downloadUrl?: string;
  errorMessage?: string | null;
  updatedAt: string;
};

export type SearchResultItem = {
  id: string;
  title: string;
  subtitle: string;
  route: string;
  type: "document" | "detection" | "rewrite";
};

export type SearchPayload = {
  query: string;
  documents: SearchResultItem[];
  detectionTasks: SearchResultItem[];
  rewriteTasks: SearchResultItem[];
};

export type NotificationItem = {
  id: string;
  title: string;
  description: string;
  paperTitle?: string;
  route: string;
  level: "info" | "warning" | "success";
  createdAt: string;
};

export type HelpItem = {
  id: string;
  title: string;
  description: string;
};

export type HelpPayload = {
  workflow: HelpItem[];
  items: HelpItem[];
  warnings: string[];
  contact: {
    channel: string;
    note: string;
    docs: string[];
  };
};

export type AppSettings = {
  appearance: {
    compactCards: boolean;
    showRiskHints: boolean;
  };
  workflow: {
    autoParseAfterUpload: boolean;
    openReportAfterDetection: boolean;
  };
  account: {
    displayName: string;
    role: string;
  };
  modeling: {
    currentProviderId: string | null;
  };
};
