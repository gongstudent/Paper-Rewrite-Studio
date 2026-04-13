import {
  BadRequestException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { TaskRunnerService } from "../common/task-runner.service";
import {
  createId,
  parseJsonString,
  rewriteParagraph,
  scoreParagraph,
  sleep
} from "../common/paper-helpers";
import { readAppSettings } from "../common/app-settings";
import { ProviderRuntimeService } from "../models/provider-runtime.service";

type CreateRewriteTaskPayload = {
  docId: string;
  segmentIds: string[];
  strategy: string;
  providerId?: string;
  model?: string;
  options?: Record<string, unknown>;
};

@Injectable()
export class RewriteTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taskRunner: TaskRunnerService,
    private readonly providerRuntimeService: ProviderRuntimeService
  ) {}

  private async resolveRewriteProviderId(explicitProviderId?: string) {
    if (explicitProviderId) {
      return explicitProviderId;
    }

    const settings = await readAppSettings();
    if (settings.modeling.currentProviderId) {
      return settings.modeling.currentProviderId;
    }

    const defaultRewriteProvider = await this.prisma.modelProvider.findFirst({
      where: { isDefaultRewrite: true },
      orderBy: { updatedAt: "desc" }
    });

    return defaultRewriteProvider?.providerId;
  }

  async createTask(payload: CreateRewriteTaskPayload) {
    const document = await this.prisma.document.findUnique({
      where: { docId: payload.docId }
    });

    if (!document) {
      throw new NotFoundException("文档不存在");
    }

    if (!payload.segmentIds?.length) {
      throw new BadRequestException("至少需要一个段落");
    }

    const resolvedProviderId = await this.resolveRewriteProviderId(payload.providerId);

    let model = payload.model ?? "skeleton-model";
    if (resolvedProviderId) {
      const provider = await this.prisma.modelProvider.findUnique({
        where: { providerId: resolvedProviderId }
      });
      model = provider?.model ?? model;
    }

    const task = await this.prisma.rewriteTask.create({
      data: {
        taskId: createId("rw"),
        docId: payload.docId,
        segmentIds: payload.segmentIds.join(","),
        providerId: resolvedProviderId,
        model,
        strategy: payload.strategy,
        options: JSON.stringify(payload.options ?? {}),
        status: "pending",
        progress: 0
      }
    });

    this.taskRunner.enqueue(`rewrite:${task.taskId}`, async () => {
      await this.runTask(task.taskId);
    });

    return {
      taskId: task.taskId,
      status: task.status
    };
  }

  async getTask(taskId: string) {
    const task = await this.prisma.rewriteTask.findUnique({
      where: { taskId },
      include: {
        candidates: {
          orderBy: { createdAt: "asc" }
        }
      }
    });

    if (!task) {
      throw new NotFoundException("任务不存在");
    }

    return {
      taskId: task.taskId,
      docId: task.docId,
      status: task.status,
      progress: task.progress,
      errorMessage: task.errorMessage,
      updatedAt: task.updatedAt,
      strategy: task.strategy,
      segmentIds: task.segmentIds.split(",").filter(Boolean),
      candidates: task.candidates
    };
  }

  async acceptCandidate(candidateId: string) {
    const candidate = await this.prisma.rewriteCandidate.findUnique({
      where: { candidateId },
      include: {
        paragraph: true,
        task: true
      }
    });

    if (!candidate) {
      throw new NotFoundException("候选版本不存在");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.rewriteCandidate.updateMany({
        where: { segmentId: candidate.segmentId },
        data: { accepted: false }
      });
      await tx.rewriteCandidate.update({
        where: { candidateId },
        data: { accepted: true }
      });
      await tx.documentParagraph.update({
        where: { segmentId: candidate.segmentId },
        data: { currentText: candidate.rewrittenText }
      });
      await tx.document.update({
        where: { docId: candidate.task.docId },
        data: {
          currentVersion: { increment: 1 }
        }
      });
    });

    return {
      candidateId,
      accepted: true
    };
  }

  async rollbackCandidate(candidateId: string) {
    const candidate = await this.prisma.rewriteCandidate.findUnique({
      where: { candidateId },
      include: { task: true }
    });

    if (!candidate) {
      throw new NotFoundException("候选版本不存在");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.rewriteCandidate.updateMany({
        where: { segmentId: candidate.segmentId },
        data: { accepted: false }
      });
      await tx.documentParagraph.update({
        where: { segmentId: candidate.segmentId },
        data: { currentText: null }
      });
      await tx.document.update({
        where: { docId: candidate.task.docId },
        data: {
          currentVersion: { increment: 1 }
        }
      });
    });

    return {
      candidateId,
      accepted: false
    };
  }

  async manualEditCandidate(
    candidateId: string,
    payload: {
      rewrittenText: string;
      explanation?: string;
    }
  ) {
    const candidate = await this.prisma.rewriteCandidate.findUnique({
      where: { candidateId },
      include: {
        task: true
      }
    });

    if (!candidate) {
      throw new NotFoundException("候选版本不存在");
    }

    const normalizedText = payload.rewrittenText.trim();
    if (!normalizedText) {
      throw new BadRequestException("手动微调内容不能为空");
    }

    const scored = scoreParagraph(normalizedText);
    const updated = await this.prisma.rewriteCandidate.update({
      where: { candidateId },
      data: {
        rewrittenText: normalizedText,
        explanation:
          payload.explanation?.trim() || "用户已手动微调当前改写结果。",
        afterScore: scored.riskScore
      }
    });

    if (updated.accepted) {
      await this.prisma.documentParagraph.update({
        where: { segmentId: updated.segmentId },
        data: { currentText: updated.rewrittenText }
      });
      await this.prisma.document.update({
        where: { docId: candidate.task.docId },
        data: {
          currentVersion: { increment: 1 }
        }
      });
    }

    return updated;
  }

  async retryTask(taskId: string) {
    const task = await this.prisma.rewriteTask.findUnique({ where: { taskId } });
    if (!task) {
      throw new NotFoundException("任务不存在");
    }

    await this.prisma.rewriteTask.update({
      where: { taskId },
      data: {
        status: "running",
        progress: 0,
        errorMessage: null
      }
    });

    this.taskRunner.enqueue(`rewrite-retry:${taskId}`, async () => {
      await this.runTask(taskId);
    });

    return {
      taskId,
      status: "running"
    };
  }

  private async runTask(taskId: string) {
    const task = await this.prisma.rewriteTask.findUnique({
      where: { taskId }
    });
    if (!task) {
      return;
    }

    const segmentIds = task.segmentIds.split(",").filter(Boolean);
    const options = parseJsonString<Record<string, unknown>>(task.options, {});

    await this.prisma.rewriteTask.update({
      where: { taskId },
      data: { status: "running", progress: 10 }
    });

    try {
      const paragraphs = await this.prisma.documentParagraph.findMany({
        where: {
          docId: task.docId,
          segmentId: { in: segmentIds }
        },
        orderBy: { order: "asc" }
      });

      for (let index = 0; index < paragraphs.length; index += 1) {
        const paragraph = paragraphs[index];
        const existingCount = await this.prisma.rewriteCandidate.count({
          where: { taskId, segmentId: paragraph.segmentId }
        });
        const variant = existingCount;
        const sourceText = paragraph.currentText || paragraph.text;
        const candidate = task.providerId
          ? await this.providerRuntimeService.rewriteWithProvider(
              task.providerId,
              sourceText,
              task.strategy,
              options
            )
          : rewriteParagraph(sourceText, task.strategy, variant);

        await sleep(160);
        await this.prisma.rewriteCandidate.create({
          data: {
            candidateId: createId("cand"),
            taskId,
            segmentId: paragraph.segmentId,
            rewrittenText: candidate.rewrittenText,
            explanation: `${candidate.explanation} 参数：${Object.keys(options).length ? "自定义" : "默认"}`,
            beforeScore: candidate.beforeScore,
            afterScore: candidate.afterScore
          }
        });

        await this.prisma.rewriteTask.update({
          where: { taskId },
          data: {
            progress: Math.round(((index + 1) / Math.max(paragraphs.length, 1)) * 100)
          }
        });
      }

      await this.prisma.rewriteTask.update({
        where: { taskId },
        data: {
          status: "done",
          progress: 100,
          finishedAt: new Date()
        }
      });
    } catch (error) {
      await this.prisma.rewriteTask.update({
        where: { taskId },
        data: {
          status: "failed",
          errorMessage: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }
}
