import {
  BadRequestException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { DocumentsService } from "../documents/documents.service";
import { readAppSettings } from "../common/app-settings";
import { PrismaService } from "../common/prisma.service";
import { TaskRunnerService } from "../common/task-runner.service";
import { createId, scoreParagraph, sleep } from "../common/paper-helpers";
import { ProviderRuntimeService } from "../models/provider-runtime.service";

type CreateDetectionTaskPayload = {
  docId: string;
  taskTypes: Array<"plagiarism" | "aigc">;
  providerId?: string;
};

@Injectable()
export class DetectionTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taskRunner: TaskRunnerService,
    private readonly documentsService: DocumentsService,
    private readonly providerRuntimeService: ProviderRuntimeService
  ) {}

  private async resolveDetectionProviderId(explicitProviderId?: string) {
    if (explicitProviderId) {
      return explicitProviderId;
    }

    const settings = await readAppSettings();
    if (settings.modeling.currentProviderId) {
      return settings.modeling.currentProviderId;
    }

    const defaultDetectProvider = await this.prisma.modelProvider.findFirst({
      where: { isDefaultDetect: true },
      orderBy: { updatedAt: "desc" }
    });

    return defaultDetectProvider?.providerId;
  }

  async createDetectionTask(payload: CreateDetectionTaskPayload) {
    const document = await this.prisma.document.findUnique({
      where: { docId: payload.docId }
    });

    if (!document) {
      throw new NotFoundException("文档不存在");
    }

    if (!payload.taskTypes?.length) {
      throw new BadRequestException("检测类型不能为空");
    }

    await this.documentsService.refreshDocumentStructure(payload.docId);

    const taskType =
      payload.taskTypes.includes("plagiarism") &&
      payload.taskTypes.includes("aigc")
        ? "mixed"
        : payload.taskTypes[0];
    const resolvedProviderId = await this.resolveDetectionProviderId(payload.providerId);

    const task = await this.prisma.detectionTask.create({
      data: {
        taskId: createId("det"),
        docId: payload.docId,
        providerId: resolvedProviderId,
        taskType,
        status: "pending",
        progress: 0
      }
    });

    this.taskRunner.enqueue(`detect:${task.taskId}`, async () => {
      await this.runTask(task.taskId);
    });

    return {
      taskIds: [task.taskId],
      status: task.status
    };
  }

  async getTask(taskId: string) {
    const task = await this.prisma.detectionTask.findUnique({
      where: { taskId },
      include: {
        segmentResults: {
          orderBy: { riskScore: "desc" }
        }
      }
    });

    if (!task) {
      throw new NotFoundException("任务不存在");
    }

    const allParagraphs = await this.prisma.documentParagraph.findMany({
      where: { docId: task.docId },
      orderBy: { order: "asc" }
    });

    return {
      taskId: task.taskId,
      docId: task.docId,
      taskType: task.taskType,
      status: task.status,
      progress: task.progress,
      createdAt: task.createdAt,
      finishedAt: task.finishedAt,
      elapsedSeconds: Math.max(
        0,
        Math.round(
          ((task.finishedAt ?? task.updatedAt).getTime() - task.createdAt.getTime()) / 1000
        )
      ),
      summaryScore: task.summaryScore,
      plagiarismScore: task.plagiarismScore,
      aigcScore: task.aigcScore,
      errorMessage: task.errorMessage,
      updatedAt: task.updatedAt,
      includedSegmentIds: allParagraphs
        .filter((item) => !item.excluded)
        .map((item) => item.segmentId),
      excludedSegmentIds: allParagraphs
        .filter((item) => item.excluded)
        .map((item) => item.segmentId),
      segmentResults: task.segmentResults.map((item) => ({
        segmentId: item.segmentId,
        originalText: item.originalText,
        riskScore: item.riskScore,
        plagiarismScore: item.plagiarismScore,
        aigcScore: item.aigcScore,
        riskType: item.riskType,
        evidence: {
          reason: item.evidence
        },
        suggestedAction: item.suggestedAction
      }))
    };
  }

  async getDocumentSummary(docId: string) {
    const latestMixed = await this.prisma.detectionTask.findFirst({
      where: { docId, taskType: "mixed", status: "done" },
      include: { segmentResults: true },
      orderBy: { createdAt: "desc" }
    });

    if (latestMixed) {
      return {
        plagiarismScore: latestMixed.plagiarismScore ?? 0,
        aigcScore: latestMixed.aigcScore ?? 0,
        highRiskCount: latestMixed.segmentResults.filter((item) => item.riskScore >= 70)
          .length,
        processedCount: latestMixed.segmentResults.filter((item) => item.riskScore < 70)
          .length
      };
    }

    const latestTasks = await this.prisma.detectionTask.findMany({
      where: { docId, status: "done" },
      orderBy: { createdAt: "desc" },
      take: 2
    });

    const plagiarismScore =
      latestTasks.find((item) => item.taskType === "plagiarism")?.summaryScore ?? 0;
    const aigcScore =
      latestTasks.find((item) => item.taskType === "aigc")?.summaryScore ?? 0;

    return {
      plagiarismScore,
      aigcScore,
      highRiskCount: 0,
      processedCount: 0
    };
  }

  private async runTask(taskId: string) {
    const task = await this.prisma.detectionTask.findUnique({
      where: { taskId }
    });
    if (!task) {
      return;
    }

    await this.prisma.detectionTask.update({
      where: { taskId },
      data: { status: "running", progress: 10, errorMessage: null }
    });

    try {
      const paragraphs = await this.prisma.documentParagraph.findMany({
        where: { docId: task.docId, excluded: false },
        orderBy: { order: "asc" }
      });

      await sleep(300);
      await this.prisma.segmentResult.deleteMany({ where: { taskId } });

      let totalPlagiarism = 0;
      let totalAigc = 0;

      for (const paragraph of paragraphs) {
        const sourceText = paragraph.currentText || paragraph.text;
        const scored = task.providerId
          ? await this.providerRuntimeService.detectWithProvider(
              task.providerId,
              sourceText,
              task.taskType
            )
          : scoreParagraph(sourceText);
        totalPlagiarism += scored.plagiarismScore;
        totalAigc += scored.aigcScore;

        await this.prisma.segmentResult.create({
          data: {
            resultId: createId("res"),
            taskId,
            segmentId: paragraph.segmentId,
            originalText: sourceText,
            riskScore:
              task.taskType === "plagiarism"
                ? scored.plagiarismScore
                : task.taskType === "aigc"
                  ? scored.aigcScore
                  : scored.riskScore,
            plagiarismScore: scored.plagiarismScore,
            aigcScore: scored.aigcScore,
            riskType: task.taskType,
            evidence: scored.evidence,
            suggestedAction: scored.suggestedAction
          }
        });
      }

      const count = Math.max(paragraphs.length, 1);
      const plagiarismScore = Math.round(totalPlagiarism / count);
      const aigcScore = Math.round(totalAigc / count);
      const summaryScore =
        task.taskType === "plagiarism"
          ? plagiarismScore
          : task.taskType === "aigc"
            ? aigcScore
            : Math.max(plagiarismScore, aigcScore);

      await this.prisma.detectionTask.update({
        where: { taskId },
        data: {
          status: "done",
          progress: 100,
          summaryScore,
          plagiarismScore,
          aigcScore,
          finishedAt: new Date()
        }
      });
    } catch (error) {
      await this.prisma.detectionTask.update({
        where: { taskId },
        data: {
          status: "failed",
          errorMessage: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }
}
