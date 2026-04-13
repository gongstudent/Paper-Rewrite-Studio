import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { TaskRunnerService } from "../common/task-runner.service";
import { createId, parseJsonString, scoreParagraph, serializeJson, sleep } from "../common/paper-helpers";

type CreateRecheckPayload = {
  docId: string;
  segmentIds?: string[];
};

@Injectable()
export class RecheckTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taskRunner: TaskRunnerService
  ) {}

  async createTask(payload: CreateRecheckPayload) {
    const document = await this.prisma.document.findUnique({
      where: { docId: payload.docId }
    });

    if (!document) {
      throw new NotFoundException("文档不存在");
    }

    const task = await this.prisma.recheckTask.create({
      data: {
        taskId: createId("re"),
        docId: payload.docId,
        segmentIds: payload.segmentIds?.join(","),
        status: "pending",
        progress: 0
      }
    });

    this.taskRunner.enqueue(`recheck:${task.taskId}`, async () => {
      await this.runTask(task.taskId);
    });

    return {
      taskId: task.taskId,
      status: task.status
    };
  }

  async getTask(taskId: string) {
    const task = await this.prisma.recheckTask.findUnique({
      where: { taskId }
    });

    if (!task) {
      throw new NotFoundException("任务不存在");
    }

    return {
      taskId: task.taskId,
      status: task.status,
      progress: task.progress,
      beforeScores: parseJsonString(task.beforeScores, {}),
      afterScores: parseJsonString(task.afterScores, {}),
      changedSegments: parseJsonString(task.changedSegments, []),
      errorMessage: task.errorMessage,
      updatedAt: task.updatedAt
    };
  }

  private async runTask(taskId: string) {
    const task = await this.prisma.recheckTask.findUnique({
      where: { taskId }
    });
    if (!task) {
      return;
    }

    await this.prisma.recheckTask.update({
      where: { taskId },
      data: { status: "running", progress: 20 }
    });

    try {
      const selectedIds = task.segmentIds?.split(",").filter(Boolean) ?? [];
      const paragraphs = await this.prisma.documentParagraph.findMany({
        where: {
          docId: task.docId,
          ...(selectedIds.length ? { segmentId: { in: selectedIds } } : {})
        },
        orderBy: { order: "asc" }
      });

      await sleep(220);

      const beforePlag = paragraphs.reduce((sum, paragraph) => {
        return sum + scoreParagraph(paragraph.text).plagiarismScore;
      }, 0);
      const beforeAigc = paragraphs.reduce((sum, paragraph) => {
        return sum + scoreParagraph(paragraph.text).aigcScore;
      }, 0);

      const afterPlag = paragraphs.reduce((sum, paragraph) => {
        return sum + scoreParagraph(paragraph.currentText || paragraph.text).plagiarismScore;
      }, 0);
      const afterAigc = paragraphs.reduce((sum, paragraph) => {
        return sum + scoreParagraph(paragraph.currentText || paragraph.text).aigcScore;
      }, 0);

      const count = Math.max(paragraphs.length, 1);
      const changedSegments = paragraphs
        .filter((paragraph) => paragraph.currentText)
        .map((paragraph) => paragraph.segmentId);

      await this.prisma.recheckTask.update({
        where: { taskId },
        data: {
          status: "done",
          progress: 100,
          beforeScores: serializeJson({
            plagiarism: Math.round(beforePlag / count),
            aigc: Math.round(beforeAigc / count)
          }),
          afterScores: serializeJson({
            plagiarism: Math.round(afterPlag / count),
            aigc: Math.round(afterAigc / count)
          }),
          changedSegments: serializeJson(changedSegments),
          finishedAt: new Date()
        }
      });
    } catch (error) {
      await this.prisma.recheckTask.update({
        where: { taskId },
        data: {
          status: "failed",
          errorMessage: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }
}
