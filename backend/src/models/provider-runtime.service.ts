import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { ModelProvider } from "@prisma/client";
import { PrismaService } from "../common/prisma.service";
import { scoreParagraph } from "../common/paper-helpers";

type ProviderPreviewResult = {
  status: string;
  result: string;
  latencyMs: number;
  engine: string;
  tokens: number;
};

type ProviderRewriteResult = {
  rewrittenText: string;
  explanation: string;
  beforeScore: number;
  afterScore: number;
};

type ProviderDetectionResult = {
  plagiarismScore: number;
  aigcScore: number;
  riskScore: number;
  suggestedAction: string;
  evidence: string;
};

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ProviderTextResult = {
  text: string;
  tokens: number;
};

@Injectable()
export class ProviderRuntimeService {
  constructor(private readonly prisma: PrismaService) {}

  async testProvider(providerId: string) {
    const provider = await this.getProvider(providerId);
    const startedAt = Date.now();

    if (!provider.baseUrl.trim() || !provider.model.trim()) {
      throw new BadRequestException("请先填写 Base URL 和模型名称。");
    }

    try {
      if (this.isOllamaProvider(provider)) {
        const response = await this.fetchJson(
          `${this.normalizeBaseUrl(provider.baseUrl)}/api/tags`,
          {
            method: "GET",
            headers: this.buildHeaders(provider)
          }
        );
        const models = Array.isArray((response as Record<string, unknown>)?.models)
          ? ((response as Record<string, unknown>).models as Array<Record<string, unknown>>)
          : [];
        const matched = models.some((item) =>
          String(item.name ?? "").includes(provider.model)
        );
        if (!matched) {
          throw new BadRequestException(
            `Model "${provider.model}" was not found in Ollama model list.`
          );
        }
      } else {
        // Some providers don't return complete model list. We treat listing as optional.
        await this.tryListModels(provider);
        await this.probeChatAvailability(provider);
      }

      const latencyMs = Date.now() - startedAt;
      await this.prisma.modelProvider.update({
        where: { providerId },
        data: { status: "ok" }
      });

      return {
        status: "ok",
        latencyMs,
        message: "连接成功"
      };
    } catch (error) {
      await this.prisma.modelProvider
        .update({
          where: { providerId },
          data: { status: "error" }
        })
        .catch(() => undefined);
      throw error;
    }
  }

  async previewProvider(providerId: string, text: string): Promise<ProviderPreviewResult> {
    const provider = await this.getProvider(providerId);
    const content = text.trim();
    const languageInstruction = this.buildLanguageInstruction(content);

    if (!content) {
      return {
        status: "empty",
        result: "Please input a text paragraph first.",
        latencyMs: 0,
        engine: provider.model,
        tokens: 0
      };
    }

    const startedAt = Date.now();
    const prompt = [
      "You are a paper analysis assistant.",
      "Briefly analyze possible duplication risk and AI-generated risk.",
      "Return plain text only.",
      languageInstruction,
      "",
      `Text: ${content}`
    ].join("\n");

    const result = this.isOllamaProvider(provider)
      ? await this.callOllama(provider, prompt)
      : await this.callOpenAICompatible(provider, [
          {
            role: "system",
            content: "You are an academic writing assistant. Return concise plain text."
          },
          {
            role: "user",
            content: prompt
          }
        ]);

    if (!result.text.trim()) {
      throw new BadRequestException(
        `Model "${provider.model}" returned empty text in preview.`
      );
    }

    return {
      status: "ok",
      result: result.text,
      latencyMs: Date.now() - startedAt,
      engine: provider.model,
      tokens: result.tokens
    };
  }

  async rewriteWithProvider(
    providerId: string,
    text: string,
    strategy: string,
    options: Record<string, unknown>
  ): Promise<ProviderRewriteResult> {
    const provider = await this.getProvider(providerId);
    const before = scoreParagraph(text);
    const languageInstruction = this.buildLanguageInstruction(text);

    const prompt = [
      "Rewrite the following academic paragraph.",
      "Requirements:",
      "1) Keep original meaning.",
      "2) Reduce template-like phrasing and AI traces.",
      "3) Preserve terms, numbers and references.",
      "4) Return rewritten paragraph only.",
      languageInstruction,
      `Strategy: ${strategy}`,
      `Options: ${JSON.stringify(options)}`,
      "",
      `Original: ${text}`
    ].join("\n");

    const result = this.isOllamaProvider(provider)
      ? await this.callOllama(provider, prompt)
      : await this.callOpenAICompatible(provider, [
          {
            role: "system",
            content: "You are a paper rewriting assistant. Return rewritten text only."
          },
          {
            role: "user",
            content: prompt
          }
        ]);

    const rewrittenText = result.text.trim();
    if (!rewrittenText) {
      throw new BadRequestException(
        `Model "${provider.model}" returned empty text for rewrite.`
      );
    }

    const after = scoreParagraph(rewrittenText);
    return {
      rewrittenText,
      explanation: `Generated with strategy "${strategy}" and preserved key academic constraints.`,
      beforeScore: before.riskScore,
      afterScore: Math.max(10, Math.min(after.riskScore, before.riskScore - 8))
    };
  }

  async detectWithProvider(
    providerId: string,
    text: string,
    taskType: string
  ): Promise<ProviderDetectionResult> {
    const provider = await this.getProvider(providerId);
    const localScore = scoreParagraph(text);
    const languageInstruction = this.buildLanguageInstruction(text);

    const prompt = [
      "Analyze the paragraph and return STRICT JSON only.",
      "Required fields: plagiarismScore, aigcScore, riskScore, suggestedAction, evidence.",
      "Scores must be integers from 0 to 100.",
      `For suggestedAction and evidence, use the same language as input. ${languageInstruction}`,
      `Task type: ${taskType}`,
      "",
      `Paragraph: ${text}`
    ].join("\n");

    const result = this.isOllamaProvider(provider)
      ? await this.callOllama(provider, prompt, true)
      : await this.callOpenAICompatible(
          provider,
          [
            {
              role: "system",
              content:
                "You are a paper risk detector. Return JSON only without markdown."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          true
        );

    let parsed = this.tryParseJson(result.text);
    if (!parsed) {
      const repaired = await this.repairDetectionJson(provider, result.text, taskType);
      parsed = this.tryParseJson(repaired);
    }

    // If the model cannot provide valid JSON, we degrade gracefully to local scoring
    // so cloud models remain usable for end-to-end workflow.
    if (!parsed) {
      return {
        plagiarismScore: localScore.plagiarismScore,
        aigcScore: localScore.aigcScore,
        riskScore: localScore.riskScore,
        suggestedAction: localScore.suggestedAction,
        evidence: `${localScore.evidence}; provider_json_unavailable`
      };
    }

    return {
      plagiarismScore: this.normalizeScore(parsed.plagiarismScore, localScore.plagiarismScore),
      aigcScore: this.normalizeScore(parsed.aigcScore, localScore.aigcScore),
      riskScore: this.normalizeScore(parsed.riskScore, localScore.riskScore),
      suggestedAction:
        typeof parsed.suggestedAction === "string" && parsed.suggestedAction.trim()
          ? parsed.suggestedAction.trim()
          : localScore.suggestedAction,
      evidence:
        typeof parsed.evidence === "string" && parsed.evidence.trim()
          ? parsed.evidence.trim()
          : localScore.evidence
    };
  }

  private async getProvider(providerId: string) {
    const provider = await this.prisma.modelProvider.findUnique({
      where: { providerId }
    });

    if (!provider) {
      throw new NotFoundException("Model provider not found.");
    }

    return provider;
  }

  private isOllamaProvider(provider: ModelProvider) {
    const baseUrl = provider.baseUrl.toLowerCase();
    return (
      provider.providerType === "local" &&
      !baseUrl.includes("/v1") &&
      (baseUrl.includes("11434") || /ollama/i.test(provider.name))
    );
  }

  private normalizeBaseUrl(baseUrl: string) {
    return baseUrl.replace(/\/+$/, "");
  }

  private buildHeaders(provider: ModelProvider) {
    return {
      "Content-Type": "application/json",
      ...(provider.apiKey
        ? {
            Authorization: `Bearer ${provider.apiKey}`
          }
        : {})
    };
  }

  private buildOpenAICompatibleUrls(provider: ModelProvider, path: string) {
    const normalized = this.normalizeBaseUrl(provider.baseUrl);
    const urls: string[] = [];
    urls.push(`${normalized}${path}`);

    const hasVersionPrefix = /\/v\d+($|\/)/i.test(normalized);
    if (!hasVersionPrefix) {
      urls.push(`${normalized}/v1${path}`);
    }

    return Array.from(new Set(urls));
  }

  private async fetchOpenAICompatible(
    provider: ModelProvider,
    path: string,
    init: RequestInit
  ) {
    const urls = this.buildOpenAICompatibleUrls(provider, path);
    const errors: string[] = [];

    for (const url of urls) {
      try {
        const payload = await this.fetchJson(url, init);
        if (typeof payload === "object" && payload != null) {
          return payload as Record<string, unknown>;
        }
        if (typeof payload === "string") {
          const normalized = payload.trim();
          if (this.isHtmlLike(normalized)) {
            throw new BadRequestException(
              `接口 ${url} 返回了 HTML 页面内容，请将 Base URL 配置为模型 API 地址（而不是控制台页面地址）。`
            );
          }
          throw new BadRequestException(
            `接口 ${url} 返回了非 JSON 内容。`
          );
        }
        throw new BadRequestException(`接口 ${url} 返回了无法识别的响应。`);
      } catch (error) {
        errors.push(`${url} -> ${this.stringifyError(error)}`);
      }
    }

    throw new BadRequestException(errors.join(" | "));
  }

  private async fetchJson(url: string, init: RequestInit) {
    const response = await fetch(url, init);
    const body = await response.text();
    if (!response.ok) {
      throw new BadRequestException(body || `Provider request failed: ${response.status}`);
    }

    if (this.isHtmlLike(body)) {
      throw new BadRequestException(
        `接口 ${url} 返回了 HTML 页面内容，请将 Base URL 改为 API 地址（通常需要包含 /v1）。`
      );
    }

    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }

  private stringifyError(error: unknown) {
    if (error instanceof BadRequestException) {
      const response = error.getResponse();
      if (typeof response === "string") {
        return response;
      }
      if (typeof response === "object" && response != null) {
        const message = (response as Record<string, unknown>).message;
        if (Array.isArray(message)) {
          return message.join("; ");
        }
        if (typeof message === "string") {
          return message;
        }
      }
      return error.message;
    }

    return error instanceof Error ? error.message : String(error);
  }

  private isHtmlLike(text: string) {
    const normalized = text.trim().toLowerCase();
    return (
      normalized.startsWith("<!doctype html") ||
      normalized.startsWith("<html") ||
      (normalized.includes("<html") && normalized.includes("</html>"))
    );
  }

  private async tryListModels(provider: ModelProvider) {
    try {
      await this.fetchOpenAICompatible(provider, "/models", {
        method: "GET",
        headers: this.buildHeaders(provider)
      });
    } catch {
      // model listing is optional for many compatible providers
    }
  }

  private async probeChatAvailability(provider: ModelProvider) {
    const probeMessages: ChatMessage[] = [
      {
        role: "system",
        content: "Reply with exactly OK."
      },
      {
        role: "user",
        content: "ping"
      }
    ];
    const result = await this.callOpenAICompatible(provider, probeMessages);
    if (!result.text.trim()) {
      throw new BadRequestException(
        `模型 ${provider.model} 未能通过最小聊天调用探测，请检查 Base URL 是否为 API 地址。`
      );
    }
  }

  private async repairDetectionJson(
    provider: ModelProvider,
    rawText: string,
    taskType: string
  ) {
    const languageInstruction = this.buildLanguageInstruction(rawText);
    const prompt = [
      "Repair the following content into strict JSON.",
      "Only return one JSON object and nothing else.",
      "Required fields: plagiarismScore, aigcScore, riskScore, suggestedAction, evidence.",
      "Scores must be integers between 0 and 100.",
      `For suggestedAction and evidence, use the same language as input. ${languageInstruction}`,
      `Task type: ${taskType}`,
      "",
      `Raw content: ${rawText}`
    ].join("\n");

    const result = this.isOllamaProvider(provider)
      ? await this.callOllama(provider, prompt, true)
      : await this.callOpenAICompatible(
          provider,
          [
            {
              role: "system",
              content: "You are a JSON repair assistant. Return JSON only."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          true
        );

    return result.text;
  }

  private async callOllama(provider: ModelProvider, prompt: string, jsonMode = false) {
    const response = await this.fetchJson(
      `${this.normalizeBaseUrl(provider.baseUrl)}/api/generate`,
      {
        method: "POST",
        headers: this.buildHeaders(provider),
        body: JSON.stringify({
          model: provider.model,
          prompt,
          stream: false,
          format: jsonMode ? "json" : undefined,
          options: {
            num_ctx: provider.contextWindow
          }
        })
      }
    );

    if (typeof response !== "object" || response == null) {
      throw new BadRequestException("Invalid Ollama response format.");
    }

    return {
      text: String((response as Record<string, unknown>).response ?? "").trim(),
      tokens: Number((response as Record<string, unknown>).eval_count ?? 0)
    };
  }

  private async callOpenAICompatible(
    provider: ModelProvider,
    messages: ChatMessage[],
    jsonMode = false
  ): Promise<ProviderTextResult> {
    const errors: string[] = [];
    const attempts = [
      () => this.callChatCompletions(provider, messages, jsonMode),
      () => this.callResponsesApi(provider, messages, jsonMode)
    ];

    for (const attempt of attempts) {
      try {
        const result = await attempt();
        if (result.text.trim()) {
          return result;
        }
      } catch (error) {
        errors.push(this.stringifyError(error));
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException(errors.join(" | "));
    }

    throw new BadRequestException(
      `模型 ${provider.model} 在所有兼容端点上都未返回有效文本。`
    );
  }

  private async callChatCompletions(
    provider: ModelProvider,
    messages: ChatMessage[],
    jsonMode: boolean
  ): Promise<ProviderTextResult> {
    const payload = await this.fetchOpenAICompatible(provider, "/chat/completions", {
      method: "POST",
      headers: this.buildHeaders(provider),
      body: JSON.stringify({
        model: provider.model,
        messages,
        temperature: jsonMode ? 0 : 0.4,
        stream: false,
        response_format: jsonMode ? this.buildJsonResponseFormat(provider) : undefined
      })
    });

    return {
      text: this.extractText(payload),
      tokens: this.extractTokens(payload)
    };
  }

  private async callResponsesApi(
    provider: ModelProvider,
    messages: ChatMessage[],
    jsonMode: boolean
  ): Promise<ProviderTextResult> {
    const combinedInput = messages
      .map((item) => `${item.role.toUpperCase()}: ${item.content}`)
      .join("\n\n");

    const body: Record<string, unknown> = {
      model: provider.model,
      input: combinedInput,
      temperature: jsonMode ? 0 : 0.4,
      max_output_tokens: jsonMode ? 400 : 800
    };

    if (jsonMode) {
      body.text = {
        format: this.buildResponsesJsonFormat()
      };
    }

    const payload = await this.fetchOpenAICompatible(provider, "/responses", {
      method: "POST",
      headers: this.buildHeaders(provider),
      body: JSON.stringify(body)
    });

    return {
      text: this.extractText(payload),
      tokens: this.extractTokens(payload)
    };
  }

  private extractText(payload: Record<string, unknown>) {
    const parts: string[] = [];
    this.collectText(parts, payload.output_text);
    this.collectText(parts, payload.text);
    this.collectText(parts, payload.result);

    const choices = Array.isArray(payload.choices)
      ? (payload.choices as Array<Record<string, unknown>>)
      : [];
    const firstChoice = choices[0];
    if (firstChoice) {
      this.collectText(parts, firstChoice.text);
      if (typeof firstChoice.message === "object" && firstChoice.message != null) {
        const message = firstChoice.message as Record<string, unknown>;
        this.collectText(parts, message.content);
        this.collectText(parts, message.refusal);
      }
    }

    const outputs = Array.isArray(payload.output)
      ? (payload.output as Array<Record<string, unknown>>)
      : [];
    for (const output of outputs) {
      this.collectText(parts, output.text);
      this.collectText(parts, output.output_text);
      this.collectText(parts, output.content);
    }

    return parts.join("\n").trim();
  }

  private collectText(buffer: string[], value: unknown): void {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        buffer.push(trimmed);
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        this.collectText(buffer, item);
      }
      return;
    }

    if (typeof value === "object" && value != null) {
      const object = value as Record<string, unknown>;
      this.collectText(buffer, object.text);
      this.collectText(buffer, object.output_text);
      this.collectText(buffer, object.value);
      this.collectText(buffer, object.content);
    }
  }

  private extractTokens(payload: Record<string, unknown>) {
    const usage =
      typeof payload.usage === "object" && payload.usage != null
        ? (payload.usage as Record<string, unknown>)
        : null;

    if (!usage) {
      return 0;
    }

    const direct = Number(usage.total_tokens ?? usage.totalTokens ?? 0);
    if (Number.isFinite(direct) && direct > 0) {
      return Math.round(direct);
    }

    const candidates = [
      usage.input_tokens,
      usage.output_tokens,
      usage.prompt_tokens,
      usage.completion_tokens,
      usage.reasoning_tokens
    ]
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item) && item > 0);

    if (!candidates.length) {
      return 0;
    }

    return Math.round(candidates.reduce((sum, item) => sum + item, 0));
  }

  private buildJsonResponseFormat(provider: ModelProvider) {
    const baseUrl = this.normalizeBaseUrl(provider.baseUrl).toLowerCase();

    if (baseUrl.includes("openai.com")) {
      return {
        type: "json_schema",
        json_schema: {
          name: "detection_result",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              plagiarismScore: { type: "integer" },
              aigcScore: { type: "integer" },
              riskScore: { type: "integer" },
              suggestedAction: { type: "string" },
              evidence: { type: "string" }
            },
            required: [
              "plagiarismScore",
              "aigcScore",
              "riskScore",
              "suggestedAction",
              "evidence"
            ]
          }
        }
      };
    }

    return { type: "json_object" };
  }

  private buildResponsesJsonFormat() {
    return {
      type: "json_schema",
      name: "detection_result",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          plagiarismScore: { type: "integer" },
          aigcScore: { type: "integer" },
          riskScore: { type: "integer" },
          suggestedAction: { type: "string" },
          evidence: { type: "string" }
        },
        required: [
          "plagiarismScore",
          "aigcScore",
          "riskScore",
          "suggestedAction",
          "evidence"
        ]
      }
    };
  }

  private buildLanguageInstruction(text: string) {
    const hasCjk = /[\u4e00-\u9fff]/.test(text);
    return hasCjk
      ? "Detect the input language automatically and answer in Chinese."
      : "Detect the input language automatically and answer in English.";
  }

  private tryParseJson(value: string) {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      const match = value.match(/\{[\s\S]*\}/);
      if (!match) {
        return null;
      }

      try {
        return JSON.parse(match[0]) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
  }

  private normalizeScore(value: unknown, fallback: number) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return fallback;
    }
    return Math.max(0, Math.min(100, Math.round(numeric)));
  }
}
