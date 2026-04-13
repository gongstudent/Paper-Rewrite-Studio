import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ArrayNotEmpty, IsArray, IsOptional, IsString } from "class-validator";
import { DetectionTasksService } from "./detection-tasks.service";

class CreateDetectionTaskDto {
  @IsString()
  docId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  taskTypes!: Array<"plagiarism" | "aigc">;

  @IsOptional()
  @IsString()
  providerId?: string;
}

@ApiTags("detection-tasks")
@Controller("api")
export class DetectionTasksController {
  constructor(private readonly detectionTasksService: DetectionTasksService) {}

  @Post("detection-tasks")
  async createTask(@Body() body: CreateDetectionTaskDto) {
    return {
      code: 0,
      message: "ok",
      data: await this.detectionTasksService.createDetectionTask(body),
      requestId: `req_${Date.now()}`
    };
  }

  @Get("detection-tasks/:taskId")
  async getTask(@Param("taskId") taskId: string) {
    return {
      code: 0,
      message: "ok",
      data: await this.detectionTasksService.getTask(taskId),
      requestId: `req_${Date.now()}`
    };
  }

  @Get("documents/:docId/detection-summary")
  async getDocumentSummary(@Param("docId") docId: string) {
    return {
      code: 0,
      message: "ok",
      data: await this.detectionTasksService.getDocumentSummary(docId),
      requestId: `req_${Date.now()}`
    };
  }
}
