import { Module } from "@nestjs/common";
import { ModelsController } from "./models.controller";
import { ModelsService } from "./models.service";
import { ProviderRuntimeService } from "./provider-runtime.service";

@Module({
  controllers: [ModelsController],
  providers: [ModelsService, ProviderRuntimeService],
  exports: [ModelsService, ProviderRuntimeService]
})
export class ModelsModule {}
