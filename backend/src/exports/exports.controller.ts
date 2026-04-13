import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsEnum, IsString } from "class-validator";
import { ExportsService } from "./exports.service";

class CreateExportTaskDto {
  @IsString()
  docId!: string;

  @IsEnum(["final_doc", "diff_report"])
  exportType!: "final_doc" | "diff_report";
}

@ApiTags("exports")
@Controller("api/exports")
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Post()
  async createTask(@Body() body: CreateExportTaskDto) {
    return {
      code: 0,
      message: "ok",
      data: await this.exportsService.createTask(body),
      requestId: `req_${Date.now()}`
    };
  }

  @Get(":exportId")
  async getTask(@Param("exportId") exportId: string) {
    return {
      code: 0,
      message: "ok",
      data: await this.exportsService.getTask(exportId),
      requestId: `req_${Date.now()}`
    };
  }
}
