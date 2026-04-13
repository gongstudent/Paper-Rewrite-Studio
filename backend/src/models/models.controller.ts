import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min
} from "class-validator";
import { ModelsService } from "./models.service";

class CreateModelProviderDto {
  @IsEnum(["local", "cloud"])
  providerType!: "local" | "cloud";

  @IsString()
  name!: string;

  @IsString()
  baseUrl!: string;

  @IsString()
  apiKey!: string;

  @IsString()
  model!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  capabilities!: string[];

  @IsInt()
  @Min(1)
  timeoutMs!: number;

  @IsInt()
  @Min(1)
  concurrency!: number;

  @IsInt()
  @Min(1)
  contextWindow!: number;
}

class UpdateModelProviderDto {
  @IsOptional()
  @IsEnum(["local", "cloud"])
  providerType?: "local" | "cloud";

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  baseUrl?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  capabilities?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  timeoutMs?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  concurrency?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  contextWindow?: number;
}

class SetDefaultDto {
  @IsEnum(["rewrite", "detect"])
  scene!: "rewrite" | "detect";
}

class PreviewModelDto {
  @IsString()
  text!: string;
}

@ApiTags("model-providers")
@Controller("api/model-providers")
export class ModelsController {
  constructor(private readonly modelsService: ModelsService) {}

  @Get()
  async listProviders() {
    return {
      code: 0,
      message: "ok",
      data: await this.modelsService.listProviders(),
      requestId: `req_${Date.now()}`
    };
  }

  @Post()
  async createProvider(@Body() body: CreateModelProviderDto) {
    return {
      code: 0,
      message: "ok",
      data: await this.modelsService.createProvider(body),
      requestId: `req_${Date.now()}`
    };
  }

  @Put(":providerId")
  async updateProvider(
    @Param("providerId") providerId: string,
    @Body() body: UpdateModelProviderDto
  ) {
    return {
      code: 0,
      message: "ok",
      data: await this.modelsService.updateProvider(providerId, body),
      requestId: `req_${Date.now()}`
    };
  }

  @Delete(":providerId")
  async deleteProvider(@Param("providerId") providerId: string) {
    return {
      code: 0,
      message: "ok",
      data: await this.modelsService.deleteProvider(providerId),
      requestId: `req_${Date.now()}`
    };
  }

  @Post(":providerId/test")
  async testProvider(@Param("providerId") providerId: string) {
    return {
      code: 0,
      message: "ok",
      data: await this.modelsService.testProvider(providerId),
      requestId: `req_${Date.now()}`
    };
  }

  @Post(":providerId/preview")
  async previewProvider(
    @Param("providerId") providerId: string,
    @Body() body: PreviewModelDto
  ) {
    return {
      code: 0,
      message: "ok",
      data: await this.modelsService.previewProvider(providerId, body.text),
      requestId: `req_${Date.now()}`
    };
  }

  @Post(":providerId/set-default")
  async setDefaultProvider(
    @Param("providerId") providerId: string,
    @Body() body: SetDefaultDto
  ) {
    return {
      code: 0,
      message: "ok",
      data: await this.modelsService.setDefaultProvider(providerId, body.scene),
      requestId: `req_${Date.now()}`
    };
  }

  @Post(":providerId/set-current")
  async setCurrentProjectProvider(@Param("providerId") providerId: string) {
    return {
      code: 0,
      message: "ok",
      data: await this.modelsService.setCurrentProjectProvider(providerId),
      requestId: `req_${Date.now()}`
    };
  }
}
