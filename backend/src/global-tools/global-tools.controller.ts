import { Body, Controller, Get, Put, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { GlobalToolsService } from "./global-tools.service";

class AppearanceSettingsDto {
  @IsOptional()
  @IsBoolean()
  compactCards?: boolean;

  @IsOptional()
  @IsBoolean()
  showRiskHints?: boolean;
}

class WorkflowSettingsDto {
  @IsOptional()
  @IsBoolean()
  autoParseAfterUpload?: boolean;

  @IsOptional()
  @IsBoolean()
  openReportAfterDetection?: boolean;
}

class AccountSettingsDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  role?: string;
}

class SaveSettingsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => AppearanceSettingsDto)
  appearance?: AppearanceSettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => WorkflowSettingsDto)
  workflow?: WorkflowSettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AccountSettingsDto)
  account?: AccountSettingsDto;
}

@ApiTags("global-tools")
@Controller("api")
export class GlobalToolsController {
  constructor(private readonly globalToolsService: GlobalToolsService) {}

  @Get("search")
  async search(@Query("q") q = "") {
    return {
      code: 0,
      message: "ok",
      data: await this.globalToolsService.search(q),
      requestId: `req_${Date.now()}`
    };
  }

  @Get("notifications")
  async getNotifications() {
    return {
      code: 0,
      message: "ok",
      data: await this.globalToolsService.getNotifications(),
      requestId: `req_${Date.now()}`
    };
  }

  @Get("help")
  async getHelpContent() {
    return {
      code: 0,
      message: "ok",
      data: await this.globalToolsService.getHelpContent(),
      requestId: `req_${Date.now()}`
    };
  }

  @Get("settings")
  async getSettings() {
    return {
      code: 0,
      message: "ok",
      data: await this.globalToolsService.getSettings(),
      requestId: `req_${Date.now()}`
    };
  }

  @Put("settings")
  async saveSettings(@Body() body: SaveSettingsDto) {
    return {
      code: 0,
      message: "ok",
      data: await this.globalToolsService.saveSettings(body as never),
      requestId: `req_${Date.now()}`
    };
  }
}
