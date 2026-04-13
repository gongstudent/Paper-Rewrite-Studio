import {
  BadRequestException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { createId } from "../common/paper-helpers";
import { readAppSettings, writeAppSettings } from "../common/app-settings";
import { ProviderRuntimeService } from "./provider-runtime.service";

type UpsertProviderPayload = {
  providerType: "local" | "cloud";
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  capabilities: string[];
  timeoutMs: number;
  concurrency: number;
  contextWindow: number;
};

function normalizeProviderPayload(payload: Partial<UpsertProviderPayload>) {
  const normalizedCapabilities =
    payload.capabilities?.map((item) => item.trim()).filter(Boolean) ?? [];

  return {
    ...payload,
    name: payload.name?.trim(),
    baseUrl: payload.baseUrl?.trim(),
    apiKey: payload.apiKey?.trim() ?? "",
    model: payload.model?.trim(),
    capabilities: Array.from(new Set(normalizedCapabilities))
  };
}

@Injectable()
export class ModelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRuntimeService: ProviderRuntimeService
  ) {}

  async listProviders() {
    const settings = await readAppSettings();
    const providers = await this.prisma.modelProvider.findMany({
      orderBy: { updatedAt: "desc" }
    });

    return providers.map((provider) => ({
      ...provider,
      isCurrentProject: settings.modeling.currentProviderId === provider.providerId
    }));
  }

  async createProvider(payload: UpsertProviderPayload) {
    const normalized = normalizeProviderPayload(payload);

    return await this.prisma.modelProvider.create({
      data: {
        providerId: createId("provider"),
        providerType: normalized.providerType!,
        name: normalized.name || "未命名模型配置",
        baseUrl: normalized.baseUrl || "",
        apiKey: normalized.apiKey || "",
        model: normalized.model || "",
        timeoutMs: normalized.timeoutMs!,
        concurrency: normalized.concurrency!,
        contextWindow: normalized.contextWindow!,
        capabilities: (normalized.capabilities ?? payload.capabilities).join(",")
      }
    });
  }

  async updateProvider(providerId: string, payload: Partial<UpsertProviderPayload>) {
    const existing = await this.prisma.modelProvider.findUnique({
      where: { providerId }
    });

    if (!existing) {
      throw new NotFoundException("模型配置不存在");
    }

    const normalized = normalizeProviderPayload(payload);

    return await this.prisma.modelProvider.update({
      where: { providerId },
      data: {
        ...normalized,
        name: normalized.name || existing.name,
        baseUrl: normalized.baseUrl ?? existing.baseUrl,
        apiKey: normalized.apiKey ?? existing.apiKey,
        model: normalized.model ?? existing.model,
        capabilities: normalized.capabilities?.join(",") ?? existing.capabilities
      }
    });
  }

  async deleteProvider(providerId: string) {
    const existing = await this.prisma.modelProvider.findUnique({
      where: { providerId }
    });

    if (!existing) {
      throw new NotFoundException("模型配置不存在");
    }

    await this.prisma.modelProvider.delete({
      where: { providerId }
    });

    const settings = await readAppSettings();
    if (settings.modeling.currentProviderId === providerId) {
      settings.modeling.currentProviderId = null;
      await writeAppSettings(settings);
    }

    return { success: true };
  }

  async testProvider(providerId: string) {
    return this.providerRuntimeService.testProvider(providerId);
  }

  async previewProvider(providerId: string, text: string) {
    return this.providerRuntimeService.previewProvider(providerId, text);
  }

  async setDefaultProvider(providerId: string, scene: "rewrite" | "detect") {
    const provider = await this.prisma.modelProvider.findUnique({
      where: { providerId }
    });
    if (!provider) {
      throw new NotFoundException("模型配置不存在");
    }

    if (scene === "rewrite") {
      await this.prisma.modelProvider.updateMany({
        data: { isDefaultRewrite: false }
      });
      return await this.prisma.modelProvider.update({
        where: { providerId },
        data: { isDefaultRewrite: true }
      });
    }

    await this.prisma.modelProvider.updateMany({
      data: { isDefaultDetect: false }
    });
    return await this.prisma.modelProvider.update({
      where: { providerId },
      data: { isDefaultDetect: true }
    });
  }

  async setCurrentProjectProvider(providerId: string) {
    const provider = await this.prisma.modelProvider.findUnique({
      where: { providerId }
    });

    if (!provider) {
      throw new NotFoundException("模型配置不存在");
    }

    const settings = await readAppSettings();
    settings.modeling.currentProviderId = providerId;
    await writeAppSettings(settings);

    return {
      providerId,
      currentProviderId: providerId
    };
  }

  async resolveCurrentProjectProvider() {
    const settings = await readAppSettings();
    if (!settings.modeling.currentProviderId) {
      return null;
    }

    return this.prisma.modelProvider.findUnique({
      where: { providerId: settings.modeling.currentProviderId }
    });
  }
}
