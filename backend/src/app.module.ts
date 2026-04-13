import { Module } from "@nestjs/common";
import { CommonModule } from "./common/common.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { DocumentsModule } from "./documents/documents.module";
import { ModelsModule } from "./models/models.module";
import { DetectionTasksModule } from "./detection-tasks/detection-tasks.module";
import { RewriteTasksModule } from "./rewrite-tasks/rewrite-tasks.module";
import { RecheckTasksModule } from "./recheck-tasks/recheck-tasks.module";
import { ExportsModule } from "./exports/exports.module";
import { GlobalToolsModule } from "./global-tools/global-tools.module";

@Module({
  imports: [
    CommonModule,
    DashboardModule,
    DocumentsModule,
    ModelsModule,
    DetectionTasksModule,
    RewriteTasksModule,
    RecheckTasksModule,
    ExportsModule,
    GlobalToolsModule
  ]
})
export class AppModule {}
