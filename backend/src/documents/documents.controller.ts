import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBody, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsOptional, IsString } from "class-validator";
import { mkdirSync } from "node:fs";
import { extname, join } from "node:path";
import { diskStorage } from "multer";
import { DocumentsService } from "./documents.service";

class SaveExclusionsDto {
  @IsOptional()
  @IsBoolean()
  excludeCover?: boolean;

  @IsOptional()
  @IsBoolean()
  excludeCatalog?: boolean;

  @IsOptional()
  @IsBoolean()
  excludeReferences?: boolean;

  @IsOptional()
  @IsBoolean()
  excludeAppendix?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  manualExcludedSegmentIds?: string[];
}

const uploadDirectory = join(process.cwd(), "storage", "uploads");
mkdirSync(uploadDirectory, { recursive: true });

@ApiTags("documents")
@Controller("api/documents")
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post("upload")
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary" },
        title: { type: "string" },
        language: { type: "string" }
      },
      required: ["file"]
    }
  })
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: uploadDirectory,
        filename: (_req, file, callback) => {
          const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          callback(null, `${suffix}${extname(file.originalname)}`);
        }
      })
    })
  )
  async uploadDocument(
    @UploadedFile() file: Express.Multer.File,
    @Body("title") title?: string,
    @Body("language") language?: string
  ) {
    return {
      code: 0,
      message: "ok",
      data: await this.documentsService.uploadDocument({ file, title, language }),
      requestId: `req_${Date.now()}`
    };
  }

  @Get()
  async listDocuments() {
    return {
      code: 0,
      message: "ok",
      data: await this.documentsService.listDocuments(),
      requestId: `req_${Date.now()}`
    };
  }

  @Get(":docId")
  async getDocument(@Param("docId") docId: string) {
    return {
      code: 0,
      message: "ok",
      data: await this.documentsService.getDocument(docId),
      requestId: `req_${Date.now()}`
    };
  }

  @Post(":docId/parse")
  async parseDocument(@Param("docId") docId: string) {
    return {
      code: 0,
      message: "ok",
      data: await this.documentsService.parseDocument(docId),
      requestId: `req_${Date.now()}`
    };
  }

  @Patch(":docId/exclusions")
  async saveExclusions(
    @Param("docId") docId: string,
    @Body() body: SaveExclusionsDto
  ) {
    return {
      code: 0,
      message: "ok",
      data: await this.documentsService.saveExclusions(docId, body),
      requestId: `req_${Date.now()}`
    };
  }

  @Delete(":docId")
  async deleteDocument(@Param("docId") docId: string) {
    return {
      code: 0,
      message: "ok",
      data: await this.documentsService.deleteDocument(docId),
      requestId: `req_${Date.now()}`
    };
  }
}
