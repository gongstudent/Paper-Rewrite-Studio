import { Injectable, NotFoundException } from "@nestjs/common";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { Document, Packer, Paragraph } from "docx";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont, rgb } from "pdf-lib";
import { PrismaService } from "../common/prisma.service";
import { TaskRunnerService } from "../common/task-runner.service";
import { createId, sleep } from "../common/paper-helpers";

type CreateExportPayload = {
  docId: string;
  exportType: "final_doc" | "diff_report";
};

@Injectable()
export class ExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taskRunner: TaskRunnerService
  ) {}

  async createTask(payload: CreateExportPayload) {
    const document = await this.prisma.document.findUnique({
      where: { docId: payload.docId }
    });

    if (!document) {
      throw new NotFoundException("文档不存在");
    }

    const exportTask = await this.prisma.exportTask.create({
      data: {
        exportId: createId("exp"),
        docId: payload.docId,
        exportType: payload.exportType,
        status: "pending",
        progress: 0
      }
    });

    this.taskRunner.enqueue(`export:${exportTask.exportId}`, async () => {
      await this.runTask(exportTask.exportId);
    });

    return {
      exportId: exportTask.exportId,
      status: exportTask.status
    };
  }

  async getTask(exportId: string) {
    const task = await this.prisma.exportTask.findUnique({
      where: { exportId }
    });
    if (!task) {
      throw new NotFoundException("任务不存在");
    }

    return {
      exportId: task.exportId,
      status: task.status,
      downloadUrl: task.downloadUrl,
      errorMessage: task.errorMessage,
      updatedAt: task.updatedAt
    };
  }

  private async runTask(exportId: string) {
    const task = await this.prisma.exportTask.findUnique({
      where: { exportId }
    });
    if (!task) {
      return;
    }

    await this.prisma.exportTask.update({
      where: { exportId },
      data: { status: "running", progress: 20 }
    });

    try {
      const document = await this.prisma.document.findUnique({
        where: { docId: task.docId },
        include: {
          paragraphs: {
            orderBy: { order: "asc" }
          }
        }
      });

      if (!document) {
        throw new NotFoundException("文档不存在");
      }

      await sleep(200);

      let content = "";
      let binaryContent: Buffer | Uint8Array | null = null;
      let extension = "txt";

      if (task.exportType === "final_doc") {
        const mergedParagraphs = document.paragraphs.map(
          (paragraph) => paragraph.currentText || paragraph.text
        );
        const sourceType = this.resolveFinalDocType(document.sourceFileType);
        extension = sourceType;

        if (sourceType === "txt") {
          content = mergedParagraphs.join("\n\n");
        } else if (sourceType === "docx") {
          binaryContent = await this.buildDocxBuffer(mergedParagraphs);
        } else {
          binaryContent = await this.buildPdfBuffer(mergedParagraphs);
        }
      } else {
        content = document.paragraphs
          .filter((paragraph) => paragraph.currentText)
          .map(
            (paragraph, index) =>
              `# 段落 ${index + 1}\n原文：${paragraph.text}\n改写：${paragraph.currentText}`
          )
          .join("\n\n");
      }

      const outputName = `${task.exportId}.${extension}`;
      const outputPath = join(process.cwd(), "storage", "exports", outputName);
      await fs.mkdir(dirname(outputPath), { recursive: true });
      if (binaryContent) {
        await fs.writeFile(outputPath, binaryContent);
      } else {
        await fs.writeFile(outputPath, content, "utf8");
      }

      await this.prisma.exportTask.update({
        where: { exportId },
        data: {
          status: "done",
          progress: 100,
          filePath: outputPath,
          downloadUrl: `/downloads/${outputName}`,
          finishedAt: new Date()
        }
      });
    } catch (error) {
      await this.prisma.exportTask.update({
        where: { exportId },
        data: {
          status: "failed",
          errorMessage: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  private resolveFinalDocType(sourceType: string | null | undefined) {
    const normalized = (sourceType ?? "").trim().toLowerCase();
    if (normalized === "txt" || normalized === "docx" || normalized === "pdf") {
      return normalized;
    }

    return "txt";
  }

  private async buildDocxBuffer(paragraphs: string[]) {
    const children: Paragraph[] = [];
    const normalizedParagraphs = paragraphs.length > 0 ? paragraphs : [""];

    normalizedParagraphs.forEach((paragraph, paragraphIndex) => {
      const lines = paragraph.split(/\r?\n/);
      const safeLines = lines.length > 0 ? lines : [""];

      safeLines.forEach((line) => {
        children.push(
          new Paragraph({
            text: line || " "
          })
        );
      });

      if (paragraphIndex < normalizedParagraphs.length - 1) {
        children.push(
          new Paragraph({
            text: " "
          })
        );
      }
    });

    const doc = new Document({
      sections: [
        {
          children
        }
      ]
    });

    return Packer.toBuffer(doc);
  }

  private async buildPdfBuffer(paragraphs: string[]) {
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 48;
    const fontSize = 12;
    const lineHeight = 18;
    const maxTextWidth = pageWidth - margin * 2;

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    const fontPath = await this.resolvePdfFontPath();
    if (!fontPath) {
      throw new Error(
        "未找到可用中文字体，无法导出 PDF。请设置 EXPORT_PDF_FONT_PATH 指向可读字体文件。"
      );
    }

    const fontBytes = await fs.readFile(fontPath);
    const font = await pdfDoc.embedFont(fontBytes, { subset: true });

    const normalizedParagraphs = paragraphs.length > 0 ? paragraphs : [""];
    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let cursorY = pageHeight - margin;

    normalizedParagraphs.forEach((paragraph, paragraphIndex) => {
      const wrappedLines = this.wrapText(paragraph, font, fontSize, maxTextWidth);
      const lines = wrappedLines.length > 0 ? wrappedLines : [""];

      lines.forEach((line) => {
        if (cursorY <= margin) {
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          cursorY = pageHeight - margin;
        }

        page.drawText(line, {
          x: margin,
          y: cursorY,
          font,
          size: fontSize,
          color: rgb(0.1, 0.1, 0.1)
        });

        cursorY -= lineHeight;
      });

      if (paragraphIndex < normalizedParagraphs.length - 1) {
        cursorY -= lineHeight * 0.6;
      }
    });

    return pdfDoc.save();
  }

  private wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number) {
    const wrapped: string[] = [];
    const rawLines = text.replace(/\r\n/g, "\n").split("\n");

    rawLines.forEach((rawLine) => {
      if (!rawLine) {
        wrapped.push("");
        return;
      }

      let currentLine = "";
      for (const char of rawLine) {
        const candidate = `${currentLine}${char}`;
        if (!currentLine || font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
          currentLine = candidate;
          continue;
        }

        wrapped.push(currentLine);
        currentLine = char;
      }

      wrapped.push(currentLine);
    });

    return wrapped;
  }

  private async resolvePdfFontPath() {
    const envPath = process.env.EXPORT_PDF_FONT_PATH?.trim();
    const candidates = [
      envPath,
      "C:\\Windows\\Fonts\\NotoSansSC-VF.ttf",
      "C:\\Windows\\Fonts\\Noto Serif SC (TrueType).otf",
      "C:\\Windows\\Fonts\\Noto Sans SC (TrueType).otf",
      "C:\\Windows\\Fonts\\SourceHanSansCN-Normal.ttf",
      "C:\\Windows\\Fonts\\simhei.ttf",
      "C:\\Windows\\Fonts\\simsunb.ttf"
    ].filter(Boolean) as string[];

    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // ignore and try next
      }
    }

    return null;
  }
}
