import { Module } from "@nestjs/common";
import { ModelsModule } from "../models/models.module";
import { RewriteTasksController } from "./rewrite-tasks.controller";
import { RewriteTasksService } from "./rewrite-tasks.service";

@Module({
  imports: [ModelsModule],
  controllers: [RewriteTasksController],
  providers: [RewriteTasksService],
  exports: [RewriteTasksService]
})
export class RewriteTasksModule {}
