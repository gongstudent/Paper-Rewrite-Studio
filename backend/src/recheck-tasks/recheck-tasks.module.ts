import { Module } from "@nestjs/common";
import { RecheckTasksController } from "./recheck-tasks.controller";
import { RecheckTasksService } from "./recheck-tasks.service";

@Module({
  controllers: [RecheckTasksController],
  providers: [RecheckTasksService]
})
export class RecheckTasksModule {}
