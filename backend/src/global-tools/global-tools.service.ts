import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import {
  type AppSettings,
  readAppSettings,
  writeAppSettings
} from "../common/app-settings";
import { normalizeUploadFilename } from "../documents/documents.service";

@Injectable()
export class GlobalToolsService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: string) {
    const keyword = query.trim();
    const [documents, detectionTasks, rewriteTasks] = await Promise.all([
      keyword
        ? this.prisma.document.findMany({
            where: {
              OR: [
                { title: { contains: keyword } },
                { sourceFileName: { contains: keyword } }
              ]
            },
            orderBy: { updatedAt: "desc" },
            take: 8
          })
        : this.prisma.document.findMany({
            orderBy: { updatedAt: "desc" },
            take: 8
          }),
      keyword
        ? this.prisma.detectionTask.findMany({
            where: {
              OR: [{ taskId: { contains: keyword } }, { taskType: { contains: keyword } }]
            },
            orderBy: { createdAt: "desc" },
            take: 6
          })
        : this.prisma.detectionTask.findMany({
            orderBy: { createdAt: "desc" },
            take: 6
          }),
      keyword
        ? this.prisma.rewriteTask.findMany({
            where: {
              OR: [{ taskId: { contains: keyword } }, { strategy: { contains: keyword } }]
            },
            orderBy: { createdAt: "desc" },
            take: 6
          })
        : this.prisma.rewriteTask.findMany({
            orderBy: { createdAt: "desc" },
            take: 6
          })
    ]);

    return {
      query: keyword,
      documents: documents.map((item) => ({
        id: item.docId,
        title: normalizeUploadFilename(item.title),
        subtitle: `${item.sourceFileName} · v${item.currentVersion}`,
        route: `/documents/${item.docId}`,
        type: "document"
      })),
      detectionTasks: detectionTasks.map((item) => ({
        id: item.taskId,
        title: `检测任务 ${item.taskId}`,
        subtitle: `${item.taskType} · ${item.status}`,
        route: `/reports/${item.taskId}`,
        type: "detection"
      })),
      rewriteTasks: rewriteTasks.map((item) => ({
        id: item.taskId,
        title: `改写任务 ${item.taskId}`,
        subtitle: `${item.strategy} · ${item.status}`,
        route: `/rewrite/${item.docId}`,
        type: "rewrite"
      }))
    };
  }

  async getNotifications() {
    const [latestDocuments, latestDetections, latestRewrites] = await Promise.all([
      this.prisma.document.findMany({
        orderBy: { updatedAt: "desc" },
        take: 4
      }),
      this.prisma.detectionTask.findMany({
        include: {
          document: true
        },
        orderBy: { updatedAt: "desc" },
        take: 4
      }),
      this.prisma.rewriteTask.findMany({
        include: {
          document: true
        },
        orderBy: { updatedAt: "desc" },
        take: 4
      })
    ]);

    const items = [
      ...latestDocuments.map((item) => ({
        id: `doc-${item.docId}`,
        title: `论文已更新：${normalizeUploadFilename(item.title)}`,
        description: `当前状态 ${item.status}，版本 v${item.currentVersion}`,
        paperTitle: normalizeUploadFilename(item.title),
        route: `/documents/${item.docId}`,
        level: item.status === "error" ? "warning" : "info",
        createdAt: item.updatedAt
      })),
      ...latestDetections.map((item) => ({
        id: `det-${item.taskId}`,
        title: `检测任务 ${item.taskType}`,
        description: `任务状态 ${item.status}`,
        paperTitle: normalizeUploadFilename(item.document.title),
        route: `/reports/${item.taskId}`,
        level: item.status === "failed" ? "warning" : "info",
        createdAt: item.updatedAt
      })),
      ...latestRewrites.map((item) => ({
        id: `rw-${item.taskId}`,
        title: `改写任务 ${item.strategy}`,
        description: `任务状态 ${item.status}`,
        paperTitle: normalizeUploadFilename(item.document.title),
        route: `/rewrite/${item.docId}`,
        level: item.status === "failed" ? "warning" : "success",
        createdAt: item.updatedAt
      }))
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 12);

    return { items };
  }

  async getHelpContent() {
    return {
      workflow: [
        {
          id: "flow-upload",
          title: "1. 上传论文",
          description: "在工作台上传 txt、docx、pdf 文件，系统会自动进入解析流程。"
        },
        {
          id: "flow-exclusions",
          title: "2. 确认排除范围",
          description:
            "在论文详情页确认封面、目录、参考文献、附录和手动排除段落，避免无关内容进入检测。"
        },
        {
          id: "flow-detect",
          title: "3. 发起检测",
          description:
            "基于当前排除范围发起查重与 AIGC 风险检测，优先关注高风险段落与异常分布。"
        },
        {
          id: "flow-rewrite",
          title: "4. 改写与复检",
          description:
            "只对需要处理的段落进行改写，人工采纳或手动微调后，再发起复检确认变化。"
        },
        {
          id: "flow-export",
          title: "5. 导出论文",
          description:
            "从“我的论文”导出最终文件。系统只替换你在平台中已采纳或已手动修改的段落，其余内容保持原样。"
        }
      ],
      items: [
        {
          id: "upload",
          title: "如何上传论文",
          description:
            "在工作台点击“上传新论文”，支持 txt、docx、pdf。上传后系统会自动解析，并跳转到排除范围设置。"
        },
        {
          id: "exclusions",
          title: "为什么要先设置排除范围",
          description:
            "主流论文工具都会把封面、目录、参考文献、附录从正文判断中分离。当前版本支持规则排除和段落级手动排除。"
        },
        {
          id: "detect",
          title: "检测结果应该怎么理解",
          description:
            "查重分数和 AIGC 风险分数用于定位问题，不代表最终机构判定。建议结合引用规范、术语准确性和人工复核一起判断。"
        },
        {
          id: "rewrite",
          title: "改写后为什么多个页面会同步",
          description:
            "采纳、回退、手动微调和重试后，系统会同步刷新“我的论文”、工作台概览、最近任务和当前论文详情，保证版本和状态一致。"
        },
        {
          id: "export",
          title: "导出论文会改动哪些内容",
          description:
            "导出只会替换你在平台中已经采纳或已手动微调的段落；未修改段落保持原文。若导入类型是 txt、docx、pdf，导出类型会保持一致。"
        },
        {
          id: "models",
          title: "模型配置说明",
          description:
            "本地模型与云端模型都在模型配置页统一管理。建议先测试连通性，再设置默认检测模型和默认改写模型。"
        },
        {
          id: "troubleshooting",
          title: "遇到问题先看哪里",
          description:
            "优先查看浏览器控制台、后端控制台输出、Swagger 接口页，以及 docs 目录中的需求/接口/测试文档。"
        }
      ],
      warnings: [
        "本工具不承诺“必过”或“保证降到某个分数阈值”，结果需要结合学校或平台规则人工复核。",
        "改写不能替代正确引用。引用、术语、数据和结论仍需由作者自行核对与负责。",
        "相似段落或 AIGC 风险提示只用于辅助定位问题，不应直接替代正式学术判断。",
        "导出前建议至少完成一次复检，并重点复核被改写段落与参考文献相关内容。"
      ],
      contact: {
        channel: "本地单人使用",
        note:
          "当前版本为本地工作台，不接入在线客服。若出现接口报错、解析异常或导出失败，建议先查看本地文档、Swagger 和控制台日志。",
        docs: [
          "README.md",
          "docs/product/论文降重工具需求文档.md",
          "frontend/docs/UI设计与接口说明文档.md",
          "backend/docs/后端接口文档.md"
        ]
      }
    };
  }

  async getSettings() {
    return readAppSettings();
  }

  async saveSettings(payload: Partial<AppSettings>) {
    const current = await this.getSettings();
    const next: AppSettings = {
      appearance: {
        ...current.appearance,
        ...(payload.appearance ?? {})
      },
      workflow: {
        ...current.workflow,
        ...(payload.workflow ?? {})
      },
      account: {
        ...current.account,
        ...(payload.account ?? {})
      },
      modeling: {
        ...current.modeling,
        ...(payload.modeling ?? {})
      }
    };

    return writeAppSettings(next);
  }
}
