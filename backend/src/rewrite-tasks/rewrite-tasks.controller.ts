import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsArray, IsObject, IsOptional, IsString } from "class-validator";
import { RewriteTasksService } from "./rewrite-tasks.service";

class CreateRewriteTaskDto {
  @IsString()
  docId!: string;

  @IsArray()
  @IsString({ each: true })
  segmentIds!: string[];

  @IsString()
  strategy!: string;

  @IsOptional()
  @IsString()
  providerId?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsObject()
  options?: Record<string, unknown>;
}

class ManualEditCandidateDto {
  @IsString()
  rewrittenText!: string;

  @IsOptional()
  @IsString()
  explanation?: string;
}

@ApiTags("rewrite-tasks")
@Controller("api")
export class RewriteTasksController {
  constructor(private readonly rewriteTasksService: RewriteTasksService) {}

  @Post("rewrite-tasks")
  async createTask(@Body() body: CreateRewriteTaskDto) {
    return {
      code: 0,
      message: "ok",
      data: await this.rewriteTasksService.createTask(body),
      requestId: `req_${Date.now()}`
    };
  }

  @Get("rewrite-tasks/:taskId")
  async getTask(@Param("taskId") taskId: string) {
    return {
      code: 0,
      message: "ok",
      data: await this.rewriteTasksService.getTask(taskId),
      requestId: `req_${Date.now()}`
    };
  }

  @Post("rewrite-candidates/:candidateId/accept")
  async acceptCandidate(@Param("candidateId") candidateId: string) {
    return {
      code: 0,
      message: "ok",
      data: await this.rewriteTasksService.acceptCandidate(candidateId),
      requestId: `req_${Date.now()}`
    };
  }

  @Post("rewrite-candidates/:candidateId/rollback")
  async rollbackCandidate(@Param("candidateId") candidateId: string) {
    return {
      code: 0,
      message: "ok",
      data: await this.rewriteTasksService.rollbackCandidate(candidateId),
      requestId: `req_${Date.now()}`
    };
  }

  @Post("rewrite-candidates/:candidateId/manual-edit")
  async manualEditCandidate(
    @Param("candidateId") candidateId: string,
    @Body() body: ManualEditCandidateDto
  ) {
    return {
      code: 0,
      message: "ok",
      data: await this.rewriteTasksService.manualEditCandidate(candidateId, body),
      requestId: `req_${Date.now()}`
    };
  }

  @Post("rewrite-tasks/:taskId/retry")
  async retryTask(@Param("taskId") taskId: string) {
    return {
      code: 0,
      message: "ok",
      data: await this.rewriteTasksService.retryTask(taskId),
      requestId: `req_${Date.now()}`
    };
  }
}
