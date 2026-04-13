import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { normalizeUploadFilename } from "../documents/documents.service";

type ActiveTaskCandidate = {
  taskId: string;
  taskName: string;
  taskType: "detection" | "rewrite" | "recheck" | "export";
  docId: string;
  route: string;
  progress: number;
  status: string;
  updatedAt: Date;
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const paperCount = await this.prisma.document.count();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [todayDetectionTasks, acceptedToday, latestDetectionTasks] = await Promise.all([
      this.prisma.detectionTask.count({
        where: { createdAt: { gte: todayStart } }
      }),
      this.prisma.rewriteCandidate.count({
        where: {
          accepted: true,
          updatedAt: { gte: todayStart }
        }
      }),
      this.prisma.detectionTask.findMany({
        orderBy: { createdAt: "desc" },
        include: { segmentResults: true }
      })
    ]);

    const highRiskSegments = latestDetectionTasks.reduce((sum, task) => {
      return sum + task.segmentResults.filter((item) => item.riskScore >= 70).length;
    }, 0);

    const totalCandidatesToday = await this.prisma.rewriteCandidate.count({
      where: { updatedAt: { gte: todayStart } }
    });

    return {
      paperCount,
      highRiskSegments,
      todayDetectionTasks,
      todayRewriteAcceptRate:
        totalCandidatesToday === 0
          ? 0
          : Math.round((acceptedToday / totalCandidatesToday) * 100)
    };
  }

  async getRecentDocuments() {
    const documents = await this.prisma.document.findMany({
      orderBy: { updatedAt: "desc" },
      take: 6
    });

    const items = await Promise.all(
      documents.map(async (document) => {
        const latestTask = await this.prisma.detectionTask.findFirst({
          where: { docId: document.docId },
          orderBy: { createdAt: "desc" }
        });
        const latestRecheck = await this.prisma.recheckTask.findFirst({
          where: { docId: document.docId },
          orderBy: { createdAt: "desc" }
        });

        return {
          docId: document.docId,
          title: normalizeUploadFilename(document.title),
          sourceFileName: normalizeUploadFilename(document.sourceFileName),
          sourceFileType: document.sourceFileType,
          language: document.language,
          updatedAt: document.updatedAt,
          version: document.currentVersion,
          parseError: document.parseError,
          latestDetectionTaskId: latestTask?.taskId ?? null,
          latestDetectionStatus: latestTask?.status ?? null,
          aigcRiskLevel:
            latestTask?.aigcScore && latestTask.aigcScore >= 70
              ? "high"
              : latestTask?.aigcScore && latestTask.aigcScore >= 45
                ? "warning"
                : "safe",
          plagiarismRiskLevel:
            latestTask?.plagiarismScore && latestTask.plagiarismScore >= 70
              ? "high"
              : latestTask?.plagiarismScore && latestTask.plagiarismScore >= 45
                ? "warning"
                : "safe",
          status:
            latestRecheck?.status === "running"
              ? "rechecking"
              : latestTask?.status === "running"
                ? "detecting"
                : document.status === "ready"
                  ? "ready"
                  : document.status
        };
      })
    );

    return { items };
  }

  async getActiveTask() {
    try {
      const [detectionTask, rewriteTask, recheckTask, exportTask] = await Promise.all([
        this.prisma.detectionTask.findFirst({
          where: { status: { in: ["pending", "running"] } },
          orderBy: { updatedAt: "desc" }
        }),
        this.prisma.rewriteTask.findFirst({
          where: { status: { in: ["pending", "running"] } },
          orderBy: { updatedAt: "desc" }
        }),
        this.prisma.recheckTask.findFirst({
          where: { status: { in: ["pending", "running"] } },
          orderBy: { updatedAt: "desc" }
        }),
        this.prisma.exportTask.findFirst({
          where: { status: { in: ["pending", "running"] } },
          orderBy: { updatedAt: "desc" }
        })
      ]);

      const candidates: ActiveTaskCandidate[] = [];

      if (detectionTask) {
        candidates.push({
          taskId: detectionTask.taskId,
          taskName: `Processing: ${detectionTask.taskType}`,
          taskType: "detection",
          docId: detectionTask.docId,
          route: `/reports/${detectionTask.taskId}`,
          progress: detectionTask.progress,
          status: detectionTask.status,
          updatedAt: detectionTask.updatedAt
        });
      }

      if (rewriteTask) {
        const segmentIds = rewriteTask.segmentIds
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
          .join(",");
        const rewriteRoute = segmentIds
          ? `/rewrite/${rewriteTask.docId}?taskId=${encodeURIComponent(rewriteTask.taskId)}&segmentIds=${encodeURIComponent(segmentIds)}&from=workspace`
          : `/rewrite/${rewriteTask.docId}?taskId=${encodeURIComponent(rewriteTask.taskId)}&from=workspace`;

        candidates.push({
          taskId: rewriteTask.taskId,
          taskName: `Processing: ${rewriteTask.strategy}`,
          taskType: "rewrite",
          docId: rewriteTask.docId,
          route: rewriteRoute,
          progress: rewriteTask.progress,
          status: rewriteTask.status,
          updatedAt: rewriteTask.updatedAt
        });
      }

      if (recheckTask) {
        candidates.push({
          taskId: recheckTask.taskId,
          taskName: "Processing: recheck task",
          taskType: "recheck",
          docId: recheckTask.docId,
          route: `/documents/${recheckTask.docId}`,
          progress: recheckTask.progress,
          status: recheckTask.status,
          updatedAt: recheckTask.updatedAt
        });
      }

      if (exportTask) {
        candidates.push({
          taskId: exportTask.exportId,
          taskName: `Processing: ${exportTask.exportType}`,
          taskType: "export",
          docId: exportTask.docId,
          route: `/documents/${exportTask.docId}`,
          progress: exportTask.progress,
          status: exportTask.status,
          updatedAt: exportTask.updatedAt
        });
      }

      candidates.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      const active = candidates[0];
      if (!active) {
        return null;
      }

      return {
        taskId: active.taskId,
        taskName: active.taskName,
        taskType: active.taskType,
        docId: active.docId,
        route: active.route,
        progress: active.progress,
        elapsedText:
          active.status === "running"
            ? `Estimated remaining ${Math.max(10, 100 - active.progress)}s`
            : "Task queued",
        status: active.status
      };
    } catch {
      return null;
    }
  }

  async getTaskHistory(tab: "detection" | "rewrite") {
    if (tab === "rewrite") {
      const items = await this.prisma.rewriteTask.findMany({
        include: {
          document: true
        },
        orderBy: { createdAt: "desc" },
        take: 10
      });

      return {
        items: items.map((item) => ({
          taskId: item.taskId,
          taskName: `Rewrite Task ${item.taskId}`,
          paperTitle: normalizeUploadFilename(item.document.title),
          startedAt: item.createdAt,
          analysisType: item.strategy,
          status: item.status
        }))
      };
    }

    const items = await this.prisma.detectionTask.findMany({
      include: {
        document: true
      },
      orderBy: { createdAt: "desc" },
      take: 10
    });

    return {
      items: items.map((item) => ({
        taskId: item.taskId,
        taskName: `Detection Task ${item.taskId}`,
        paperTitle: normalizeUploadFilename(item.document.title),
        startedAt: item.createdAt,
        analysisType: item.taskType,
        status: item.status
      }))
    };
  }
}
