import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { TaskRunnerService } from "./task-runner.service";

@Global()
@Module({
  providers: [PrismaService, TaskRunnerService],
  exports: [PrismaService, TaskRunnerService]
})
export class CommonModule {}
