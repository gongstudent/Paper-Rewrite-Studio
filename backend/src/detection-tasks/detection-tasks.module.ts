import { Module } from "@nestjs/common";
import { DocumentsModule } from "../documents/documents.module";
import { ModelsModule } from "../models/models.module";
import { DetectionTasksController } from "./detection-tasks.controller";
import { DetectionTasksService } from "./detection-tasks.service";

@Module({
  imports: [DocumentsModule, ModelsModule],
  controllers: [DetectionTasksController],
  providers: [DetectionTasksService],
  exports: [DetectionTasksService]
})
export class DetectionTasksModule {}
