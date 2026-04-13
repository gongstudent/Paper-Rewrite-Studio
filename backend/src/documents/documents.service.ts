import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DocumentParagraph, DocumentSection } from "@prisma/client";
import { promises as fs } from "node:fs";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { extname } from "node:path";
import { PrismaService } from "../common/prisma.service";
import { TaskRunnerService } from "../common/task-runner.service";
import { createId, splitParagraphs } from "../common/paper-helpers";

type UploadPayload = {
  file: Express.Multer.File;
  title?: string;
  language?: string;
};

type SaveExclusionsPayload = {
  excludeCover?: boolean;
  excludeCatalog?: boolean;
  excludeReferences?: boolean;
  excludeAppendix?: boolean;
  manualExcludedSegmentIds?: string[];
};

export function normalizeUploadFilename(filename: string) {
  try {
    const decoded = Buffer.from(filename, "latin1").toString("utf8");
    const hasReadableCjk = /[\u4e00-\u9fff]/.test(decoded);
    const originalLooksMojibake = /[ÃÂåæäçé]/.test(filename) || /�/.test(filename);

    if (hasReadableCjk || (originalLooksMojibake && !decoded.includes("�"))) {
      return decoded;
    }
  } catch {
    return filename;
  }

  return filename;
}

function looksLikeCover(text: string) {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }

  return normalized.length <= 60 && !/[。！？!?；;，,]/.test(normalized);
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taskRunner: TaskRunnerService
  ) {}

  async uploadDocument(payload: UploadPayload) {
    const normalizedOriginalName = normalizeUploadFilename(payload.file.originalname);
    const extension = extname(normalizedOriginalName).toLowerCase();
    const fileType = extension.replace(".", "");

    if (fileType === "doc") {
      throw new BadRequestException(
        "当前 .doc 文件暂不支持自动解析，请先转换为 .docx、pdf 或 txt 后再上传。"
      );
    }

    if (!["docx", "pdf", "txt"].includes(fileType)) {
      throw new BadRequestException("文件格式不支持");
    }

    const title =
      payload.title?.trim() ||
      normalizedOriginalName.replace(/\.[^.]+$/, "") ||
      "未命名论文";

    const document = await this.prisma.document.create({
      data: {
        docId: createId("doc"),
        title,
        language: payload.language ?? "zh-CN",
        sourceFileName: normalizedOriginalName,
        sourceFileType: fileType,
        sourceFilePath: payload.file.path,
        status: "uploaded"
      }
    });

    return {
      docId: document.docId,
      title: document.title,
      sourceFile: {
        name: normalizeUploadFilename(document.sourceFileName),
        type: document.sourceFileType
      },
      version: document.currentVersion
    };
  }

  async listDocuments() {
    const documents = await this.prisma.document.findMany({
      orderBy: { updatedAt: "desc" }
    });

    const items = await Promise.all(
      documents.map(async (document) => {
        const latestTask = await this.prisma.detectionTask.findFirst({
          where: { docId: document.docId },
          orderBy: { createdAt: "desc" }
        });

        return {
          docId: document.docId,
          title: document.title,
          language: document.language,
          version: document.currentVersion,
          updatedAt: document.updatedAt,
          status: document.status,
          parseError: document.parseError,
          sourceFileName: normalizeUploadFilename(document.sourceFileName),
          sourceFileType: document.sourceFileType,
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
                : "safe"
        };
      })
    );

    return { items };
  }

  async getDocument(docId: string) {
    const document = await this.prisma.document.findUnique({
      where: { docId },
      include: {
        sections: {
          orderBy: { order: "asc" }
        },
        paragraphs: {
          orderBy: { order: "asc" }
        }
      }
    });

    if (!document) {
      throw new NotFoundException("文档不存在");
    }

    return {
      docId: document.docId,
      title: document.title,
      language: document.language,
      version: document.currentVersion,
      status: document.status,
      parseError: document.parseError,
      exclusions: {
        excludeCover: document.excludeCover,
        excludeCatalog: document.excludeCatalog,
        excludeReferences: document.excludeReferences,
        excludeAppendix: document.excludeAppendix,
        manualExcludedSegmentIds: document.manualExcludedIds
          ? document.manualExcludedIds.split(",").filter(Boolean)
          : []
      },
      sourceFile: {
        name: normalizeUploadFilename(document.sourceFileName),
        type: document.sourceFileType
      },
      sections: document.sections,
      paragraphs: document.paragraphs,
      citations: []
    };
  }

  async parseDocument(docId: string) {
    const document = await this.prisma.document.findUnique({ where: { docId } });
    if (!document) {
      throw new NotFoundException("文档不存在");
    }

    await this.prisma.document.update({
      where: { docId },
      data: { status: "parsing", parseError: null }
    });

    this.taskRunner.enqueue(`parse:${docId}`, async () => {
      await this.executeParse(docId);
    });

    return {
      taskId: createId("parse"),
      status: "pending"
    };
  }

  async saveExclusions(docId: string, payload: SaveExclusionsPayload) {
    const document = await this.prisma.document.findUnique({ where: { docId } });
    if (!document) {
      throw new NotFoundException("文档不存在");
    }

    await this.prisma.document.update({
      where: { docId },
      data: {
        excludeCover: payload.excludeCover ?? document.excludeCover,
        excludeCatalog: payload.excludeCatalog ?? document.excludeCatalog,
        excludeReferences: payload.excludeReferences ?? document.excludeReferences,
        excludeAppendix: payload.excludeAppendix ?? document.excludeAppendix,
        manualExcludedIds: payload.manualExcludedSegmentIds?.join(",") ?? document.manualExcludedIds
      }
    });

    await this.executeParse(docId);
    return this.getDocument(docId);
  }

  async refreshDocumentStructure(docId: string) {
    const document = await this.prisma.document.findUnique({ where: { docId } });
    if (!document) {
      throw new NotFoundException("文档不存在");
    }

    await this.executeParse(docId);
    return this.getDocument(docId);
  }

  async deleteDocument(docId: string) {
    const document = await this.prisma.document.findUnique({
      where: { docId },
      include: {
        exportTasks: true
      }
    });

    if (!document) {
      throw new NotFoundException("文档不存在");
    }

    const pathsToDelete = [
      document.sourceFilePath,
      ...document.exportTasks.map((item) => item.filePath).filter(Boolean)
    ] as string[];

    await this.prisma.document.delete({
      where: { docId }
    });

    await Promise.allSettled(
      pathsToDelete.map(async (filePath) => {
        if (!filePath) {
          return;
        }
        await fs.rm(filePath, { force: true });
      })
    );

    return {
      success: true,
      docId
    };
  }

  private async readSourceText(sourceFilePath: string, sourceFileType: string) {
    if (sourceFileType === "txt") {
      return fs.readFile(sourceFilePath, "utf8");
    }

    if (sourceFileType === "docx") {
      const result = await mammoth.extractRawText({ path: sourceFilePath });
      return result.value;
    }

    if (sourceFileType === "pdf") {
      const buffer = await fs.readFile(sourceFilePath);
      const result = await pdfParse(buffer);
      return result.text;
    }

    throw new BadRequestException("当前文件格式暂不支持自动解析，请优先使用 txt、docx 或 pdf");
  }

  private async executeParse(docId: string) {
    const document = await this.prisma.document.findUnique({ where: { docId } });
    if (!document) {
      return;
    }

    try {
      const rawText = await this.readSourceText(
        document.sourceFilePath,
        document.sourceFileType
      );
      const manualExcludedIds = document.manualExcludedIds
        ? document.manualExcludedIds.split(",").filter(Boolean)
        : [];
      const { sections, paragraphs } = this.structureDocument(rawText, {
        docId,
        excludeCover: document.excludeCover,
        excludeCatalog: document.excludeCatalog,
        excludeReferences: document.excludeReferences,
        excludeAppendix: document.excludeAppendix,
        manualExcludedIds
      });

      await this.prisma.$transaction(async (tx) => {
        await tx.documentParagraph.deleteMany({ where: { docId } });
        await tx.documentSection.deleteMany({ where: { docId } });

        if (sections.length > 0) {
          await tx.documentSection.createMany({ data: sections });
        }
        if (paragraphs.length > 0) {
          await tx.documentParagraph.createMany({ data: paragraphs });
        }

        await tx.document.update({
          where: { docId },
          data: {
            status: "ready",
            parseError: null
          }
        });
      });
    } catch (error) {
      await this.prisma.document.update({
        where: { docId },
        data: {
          status: "error",
          parseError: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  private structureDocument(
    rawText: string,
    options: {
      docId: string;
      excludeCover: boolean;
      excludeCatalog: boolean;
      excludeReferences: boolean;
      excludeAppendix: boolean;
      manualExcludedIds: string[];
    }
  ) {
    const chunks = splitParagraphs(rawText);
    const defaultSectionId = `${options.docId}_sec_1`;
    const sections: Array<Omit<DocumentSection, "createdAt" | "updatedAt">> = [
      {
        sectionId: defaultSectionId,
        docId: options.docId,
        title: "正文",
        level: 1,
        order: 1
      }
    ];

    let currentSectionId = defaultSectionId;
    let sectionOrder = 1;
    let inReferences = false;
    let inAppendix = false;
    let inCatalog = false;

    const paragraphs: Array<
      Omit<DocumentParagraph, "createdAt" | "updatedAt" | "currentText">
    > = [];

    chunks.forEach((chunk, index) => {
      const headingMatch =
        /^(第[一二三四五六七八九十百]+[章节部分]|[一二三四五六七八九十]+、|[0-9]+\.)/.test(
          chunk
        );

      if (headingMatch) {
        currentSectionId = `${options.docId}_sec_${sectionOrder + 1}`;
        sectionOrder += 1;
        sections.push({
          sectionId: currentSectionId,
          docId: options.docId,
          title: chunk.slice(0, 40),
          level: 1,
          order: sectionOrder
        });

        inReferences = /参考文献/.test(chunk);
        inAppendix = /附录/.test(chunk);
        inCatalog = /目录/.test(chunk);
        return;
      }

      if (/参考文献/.test(chunk)) {
        inReferences = true;
        inAppendix = false;
        inCatalog = false;
      }
      if (/附录/.test(chunk)) {
        inReferences = false;
        inAppendix = true;
        inCatalog = false;
      }
      if (/目录/.test(chunk)) {
        inReferences = false;
        inAppendix = false;
        inCatalog = true;
      }

      const segmentId = `${options.docId}_seg_${index + 1}`;
      const paragraphType = inCatalog
        ? "catalog"
        : inReferences
          ? "references"
          : inAppendix
            ? "appendix"
            : index === 0 && looksLikeCover(chunk)
              ? "cover"
              : "body";
      const autoExcluded =
        (options.excludeCover && paragraphType === "cover") ||
        (options.excludeCatalog && paragraphType === "catalog") ||
        (options.excludeReferences && paragraphType === "references") ||
        (options.excludeAppendix && paragraphType === "appendix");

      paragraphs.push({
        segmentId,
        docId: options.docId,
        sectionId: currentSectionId,
        text: chunk,
        order: index + 1,
        excluded:
          autoExcluded || options.manualExcludedIds.includes(segmentId),
        paragraphType
      });
    });

    return { sections, paragraphs };
  }
}
