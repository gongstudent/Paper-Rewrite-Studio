import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsArray, IsOptional, IsString } from "class-validator";
import { RecheckTasksService } from "./recheck-tasks.service";

class CreateRecheckTaskDto {
  @IsString()
  docId!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  segmentIds?: string[];
}

@ApiTags("recheck-tasks")
@Controller("api/recheck-tasks")
export class RecheckTasksController {
  constructor(private readonly recheckTasksService: RecheckTasksService) {}

  @Post()
  async createTask(@Body() body: CreateRecheckTaskDto) {
    return {
      code: 0,
      message: "ok",
      data: await this.recheckTasksService.createTask(body),
      requestId: `req_${Date.now()}`
    };
  }

  @Get(":taskId")
  async getTask(@Param("taskId") taskId: string) {
    return {
      code: 0,
      message: "ok",
      data: await this.recheckTasksService.getTask(taskId),
      requestId: `req_${Date.now()}`
    };
  }
}
