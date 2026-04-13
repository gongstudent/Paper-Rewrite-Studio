import { Module } from "@nestjs/common";
import { GlobalToolsController } from "./global-tools.controller";
import { GlobalToolsService } from "./global-tools.service";

@Module({
  controllers: [GlobalToolsController],
  providers: [GlobalToolsService]
})
export class GlobalToolsModule {}
