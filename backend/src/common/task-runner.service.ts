import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class TaskRunnerService {
  private readonly logger = new Logger(TaskRunnerService.name);

  enqueue(name: string, handler: () => Promise<void>) {
    setTimeout(() => {
      void handler().catch((error: unknown) => {
        const message =
          error instanceof Error ? error.stack ?? error.message : String(error);
        this.logger.error(`Task ${name} failed: ${message}`);
      });
    }, 50);
  }
}
