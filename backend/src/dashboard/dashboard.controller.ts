import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { DashboardService } from "./dashboard.service";

@ApiTags("dashboard")
@Controller("api/dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("overview")
  async getOverview() {
    return {
      code: 0,
      message: "ok",
      data: await this.dashboardService.getOverview(),
      requestId: `req_${Date.now()}`
    };
  }

  @Get("recent-documents")
  async getRecentDocuments() {
    return {
      code: 0,
      message: "ok",
      data: await this.dashboardService.getRecentDocuments(),
      requestId: `req_${Date.now()}`
    };
  }

  @Get("active-task")
  async getActiveTask() {
    return {
      code: 0,
      message: "ok",
      data: await this.dashboardService.getActiveTask(),
      requestId: `req_${Date.now()}`
    };
  }

  @Get("task-history")
  async getTaskHistory(
    @Query("tab") tab: "detection" | "rewrite" = "detection"
  ) {
    return {
      code: 0,
      message: "ok",
      data: await this.dashboardService.getTaskHistory(tab),
      requestId: `req_${Date.now()}`
    };
  }
}
