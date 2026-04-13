import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { api } from "../app/api";
import type { ModelProvider } from "../app/types";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { RiskTag } from "../components/RiskTag";

const initialForm: Omit<ModelProvider, "providerId" | "status"> = {
  providerType: "local",
  name: "",
  baseUrl: "http://127.0.0.1:11434",
  apiKey: "",
  model: "",
  capabilities: ["rewrite", "detect"],
  timeoutMs: 60000,
  concurrency: 2,
  contextWindow: 8192,
  isDefaultDetect: false,
  isDefaultRewrite: false,
  isCurrentProject: false
};

export function ModelsPage() {
  const queryClient = useQueryClient();
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"idle" | "create" | "edit">("idle");
  const [form, setForm] = useState(initialForm);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState(
    "请输入一段学术摘要或论述，点击即时测试查看模型分析结果。"
  );
  const [previewResult, setPreviewResult] = useState<{
    status: string;
    result: string;
    latencyMs: number;
    engine: string;
    tokens: number;
  } | null>(null);

  const providersQuery = useQuery({
    queryKey: ["model-providers"],
    queryFn: api.listProviders,
    retry: false
  });

  const providers = providersQuery.data ?? [];
  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.providerId === selectedProviderId) ?? null,
    [providers, selectedProviderId]
  );

  useEffect(() => {
    if (selectedProvider) {
      setFormMode("edit");
      setForm({
        providerType: selectedProvider.providerType,
        name: selectedProvider.name,
        baseUrl: selectedProvider.baseUrl,
        apiKey: selectedProvider.apiKey,
        model: selectedProvider.model,
        capabilities: selectedProvider.capabilities,
        timeoutMs: selectedProvider.timeoutMs,
        concurrency: selectedProvider.concurrency,
        contextWindow: selectedProvider.contextWindow,
        isDefaultDetect: selectedProvider.isDefaultDetect,
        isDefaultRewrite: selectedProvider.isDefaultRewrite,
        isCurrentProject: selectedProvider.isCurrentProject
      });
      return;
    }

    setForm(initialForm);
  }, [selectedProvider]);

  const resetPreviewState = () => {
    setTestResult(null);
    setPreviewResult(null);
    setPreviewText("请输入一段学术摘要或论述，点击即时测试查看模型分析结果。");
  };

  const handleCreateNew = () => {
    setSelectedProviderId(null);
    setFormMode("create");
    setForm(initialForm);
    resetPreviewState();
  };

  const handleBackToIdle = () => {
    setSelectedProviderId(null);
    setFormMode("idle");
    setForm(initialForm);
    resetPreviewState();
  };

  const invalidateProviders = async () => {
    await queryClient.invalidateQueries({ queryKey: ["model-providers"] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        capabilities: form.capabilities
      };

      if (selectedProviderId) {
        return api.updateProvider(selectedProviderId, payload);
      }

      return api.createProvider(payload);
    },
    onSuccess: async (provider) => {
      setSelectedProviderId(provider.providerId);
      setFormMode("edit");
      await invalidateProviders();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteProvider(selectedProviderId!),
    onSuccess: async () => {
      const remainingProviders = providers.filter(
        (provider) => provider.providerId !== selectedProviderId
      );

      if (remainingProviders.length > 0) {
        setSelectedProviderId(remainingProviders[0].providerId);
        setFormMode("edit");
        resetPreviewState();
      } else {
        handleBackToIdle();
      }

      await invalidateProviders();
    }
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      let providerId = selectedProviderId;
      if (!providerId) {
        const created = await api.createProvider(form);
        providerId = created.providerId;
        setSelectedProviderId(providerId);
        setFormMode("edit");
      }

      return api.testProvider(providerId);
    },
    onSuccess: async (result) => {
      setTestResult(`${result.message} · ${result.latencyMs}ms`);
      await invalidateProviders();
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      setTestResult(`测试失败：${message}`);
    }
  });

  const setDefaultMutation = useMutation({
    mutationFn: ({
      providerId,
      scene
    }: {
      providerId: string;
      scene: "rewrite" | "detect";
    }) => api.setDefaultProvider(providerId, scene),
    onSuccess: async () => {
      await invalidateProviders();
    }
  });

  const setCurrentProjectMutation = useMutation({
    mutationFn: (providerId: string) => api.setCurrentProjectProvider(providerId),
    onSuccess: async () => {
      await invalidateProviders();
    }
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      let providerId = selectedProviderId;
      if (!providerId) {
        const created = await api.createProvider(form);
        providerId = created.providerId;
        setSelectedProviderId(providerId);
        setFormMode("edit");
      }

      return api.previewProvider(providerId, { text: previewText });
    },
    onSuccess: (result) => {
      setPreviewResult(result);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      setPreviewResult({
        status: "error",
        result: `即时测试失败：${message}`,
        latencyMs: 0,
        engine: selectedProvider?.model ?? form.model ?? "unknown",
        tokens: 0
      });
    }
  });

  const hasSelectedProvider = Boolean(selectedProviderId);

  return (
    <>
      <PageHeader
        title="模型配置"
        description="统一管理本地模型和云端模型，并通过即时测试验证连通性。"
        actions={
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || formMode === "idle"}
            className="rounded-2xl bg-primary-500 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saveMutation.isPending
              ? "保存中..."
              : formMode === "idle"
                ? "请先选择或新建"
                : formMode === "create"
                  ? "创建模型配置"
                  : "保存当前配置"}
          </button>
        }
      />

      {providersQuery.isError ? (
        <div className="mb-6 rounded-3xl border border-red-200 bg-white p-6 text-sm text-danger shadow-soft">
          模型配置加载失败，请确认后端服务正常后刷新重试。
        </div>
      ) : null}

      <div className="grid gap-6 2xl:grid-cols-[320px_minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <div className="rounded-3xl border border-border bg-white p-6 shadow-soft">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">已配置模型</h2>
              <button
                onClick={handleCreateNew}
                className="text-sm font-medium text-primary-500"
              >
                新建
              </button>
            </div>

            {providers.length || formMode === "create" ? (
              <div className="space-y-3">
                {formMode === "create" ? (
                  <div className="w-full rounded-2xl border border-dashed border-primary-300 bg-primary-50/60 p-4 text-left">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-primary-600">新建配置草稿</p>
                        <p className="mt-1 text-sm text-text-600">
                          填写右侧表单后，点击“创建模型配置”保存。
                        </p>
                      </div>
                      <RiskTag label="草稿" tone="warning" />
                    </div>
                  </div>
                ) : null}

                {providers.map((provider) => (
                  <button
                    key={provider.providerId}
                    onClick={() => {
                      setSelectedProviderId(provider.providerId);
                      setFormMode("edit");
                      resetPreviewState();
                    }}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      selectedProviderId === provider.providerId
                        ? "border-primary-500 bg-primary-50"
                        : "border-border bg-slate-50/60"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{provider.name}</p>
                        <p className="mt-1 truncate text-sm text-text-600">
                          {provider.providerType} · {provider.model}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {provider.isCurrentProject ? (
                            <RiskTag label="当前项目模型" tone="warning" />
                          ) : null}
                          {provider.isDefaultRewrite ? (
                            <RiskTag label="默认改写" tone="safe" />
                          ) : null}
                          {provider.isDefaultDetect ? (
                            <RiskTag label="默认检测" tone="mixed" />
                          ) : null}
                        </div>
                      </div>
                      <RiskTag
                        label={provider.status}
                        tone={
                          provider.status === "ok"
                            ? "safe"
                            : provider.status === "error"
                              ? "high"
                              : "warning"
                        }
                      />
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                title="还没有模型配置"
                description="先创建一个本地或云端模型，后续检测和改写都会复用这里的配置。"
              />
            )}
          </div>
        </div>

        <div className="min-w-0 rounded-3xl border border-border bg-white p-6 shadow-soft">
          {formMode === "idle" ? (
            <EmptyState
              title="请选择一个模型配置"
              description="你可以从左侧选择已有配置进行编辑，或点击“新建”创建新的模型提供方。"
            />
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">基础参数</h2>
                  <p className="mt-2 text-sm text-text-600">
                    保存后可用于检测、改写和即时测试，建议先完成 Base URL、模型名称与能力配置。
                  </p>
                </div>
                {selectedProvider ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedProvider.isDefaultRewrite ? (
                      <RiskTag label="当前为默认改写模型" tone="safe" />
                    ) : null}
                    {selectedProvider.isDefaultDetect ? (
                      <RiskTag label="当前为默认检测模型" tone="mixed" />
                    ) : null}
                    {selectedProvider.isCurrentProject ? (
                      <RiskTag label="当前为项目使用模型" tone="warning" />
                    ) : null}
                  </div>
                ) : null}
              </div>

              {formMode === "create" ? (
                <div className="mt-6 rounded-2xl border border-primary-200 bg-primary-50/60 p-4 text-sm text-primary-600">
                  当前处于“新建配置”模式。填写参数后点击右上角“创建模型配置”即可保存为新的模型提供方。
                </div>
              ) : null}

              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <label className="grid min-w-0 gap-2">
                  <span className="text-sm font-medium">提供方类型</span>
                  <select
                    value={form.providerType}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        providerType: event.target.value as "local" | "cloud"
                      }))
                    }
                    className="w-full min-w-0 rounded-2xl border border-border px-4 py-3"
                  >
                    <option value="local">本地模型</option>
                    <option value="cloud">云端模型</option>
                  </select>
                </label>

                <label className="grid min-w-0 gap-2">
                  <span className="text-sm font-medium">配置名称</span>
                  <input
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, name: event.target.value }))
                    }
                    className="w-full min-w-0 rounded-2xl border border-border px-4 py-3"
                    placeholder="例如：本地 Ollama"
                  />
                </label>

                <label className="grid min-w-0 gap-2 lg:col-span-2">
                  <span className="text-sm font-medium">Base URL</span>
                  <input
                    value={form.baseUrl}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, baseUrl: event.target.value }))
                    }
                    className="w-full min-w-0 rounded-2xl border border-border px-4 py-3"
                  />
                </label>

                <label className="grid min-w-0 gap-2 lg:col-span-2">
                  <span className="text-sm font-medium">API Key / Token</span>
                  <input
                    value={form.apiKey}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, apiKey: event.target.value }))
                    }
                    className="w-full min-w-0 rounded-2xl border border-border px-4 py-3"
                    placeholder="本地模型可留空"
                  />
                </label>

                <label className="grid min-w-0 gap-2">
                  <span className="text-sm font-medium">模型名称</span>
                  <input
                    value={form.model}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, model: event.target.value }))
                    }
                    className="w-full min-w-0 rounded-2xl border border-border px-4 py-3"
                  />
                </label>

                <label className="grid min-w-0 gap-2">
                  <span className="text-sm font-medium">支持能力</span>
                  <input
                    value={form.capabilities.join(",")}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        capabilities: event.target.value
                          .split(",")
                          .map((item) => item.trim())
                          .filter(Boolean)
                      }))
                    }
                    className="w-full min-w-0 rounded-2xl border border-border px-4 py-3"
                  />
                </label>

                <label className="grid min-w-0 gap-2">
                  <span className="text-sm font-medium">超时（ms）</span>
                  <input
                    type="number"
                    value={form.timeoutMs}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        timeoutMs: Number(event.target.value)
                      }))
                    }
                    className="w-full min-w-0 rounded-2xl border border-border px-4 py-3"
                  />
                </label>

                <label className="grid min-w-0 gap-2">
                  <span className="text-sm font-medium">最大并发</span>
                  <input
                    type="number"
                    value={form.concurrency}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        concurrency: Number(event.target.value)
                      }))
                    }
                    className="w-full min-w-0 rounded-2xl border border-border px-4 py-3"
                  />
                </label>

                <label className="grid min-w-0 gap-2">
                  <span className="text-sm font-medium">上下文长度</span>
                  <input
                    type="number"
                    value={form.contextWindow}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        contextWindow: Number(event.target.value)
                      }))
                    }
                    className="w-full min-w-0 rounded-2xl border border-border px-4 py-3"
                  />
                </label>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={() => testMutation.mutate()}
                  disabled={testMutation.isPending}
                  className="rounded-2xl border border-border bg-white px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {testMutation.isPending ? "测试中..." : "测试连接"}
                </button>

                {hasSelectedProvider ? (
                  <>
                    <button
                      onClick={() => setCurrentProjectMutation.mutate(selectedProviderId!)}
                      disabled={setCurrentProjectMutation.isPending}
                      className="rounded-2xl border border-border bg-white px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {setCurrentProjectMutation.isPending ? "设置中..." : "设为当前项目模型"}
                    </button>
                    <button
                      onClick={() =>
                        setDefaultMutation.mutate({
                          providerId: selectedProviderId!,
                          scene: "rewrite"
                        })
                      }
                      disabled={setDefaultMutation.isPending}
                      className="rounded-2xl border border-border bg-white px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      设为默认改写模型
                    </button>
                    <button
                      onClick={() =>
                        setDefaultMutation.mutate({
                          providerId: selectedProviderId!,
                          scene: "detect"
                        })
                      }
                      disabled={setDefaultMutation.isPending}
                      className="rounded-2xl border border-border bg-white px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      设为默认检测模型
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate()}
                      disabled={deleteMutation.isPending}
                      className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-danger disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      删除配置
                    </button>
                  </>
                ) : null}
              </div>
            </>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          <div className="rounded-3xl border border-border bg-white p-6 shadow-soft">
            <div className="mb-4 flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-primary-500" />
              <h2 className="text-lg font-semibold">即时测试结果</h2>
            </div>

            <div className="space-y-4">
              {testResult ? (
                <div
                  className={`rounded-2xl p-4 text-sm ${
                    testResult.startsWith("测试失败")
                      ? "bg-red-50 text-danger"
                      : "bg-emerald-50 text-success"
                  }`}
                >
                  {testResult}
                </div>
              ) : (
                <p className="text-sm text-text-600">
                  保存或选择模型后点击“测试连接”，这里会显示当前模型的连通性结果。
                </p>
              )}

              <label className="grid gap-2">
                <span className="text-sm font-medium">测试文本输入</span>
                <textarea
                  value={previewText}
                  onChange={(event) => setPreviewText(event.target.value)}
                  rows={7}
                  className="w-full min-w-0 rounded-2xl border border-border px-4 py-3 text-sm outline-none transition focus:border-primary-500"
                />
              </label>

              <button
                onClick={() => previewMutation.mutate()}
                disabled={previewMutation.isPending}
                className="w-full rounded-2xl bg-primary-500 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {previewMutation.isPending ? "分析中..." : "开始即时测试"}
              </button>

              <div className="rounded-2xl border border-border bg-slate-50/60 p-4">
                {previewResult ? (
                  <>
                    <div className="mb-3 flex flex-wrap gap-2">
                      <RiskTag
                        label={previewResult.status}
                        tone={
                          previewResult.status === "ok"
                            ? "safe"
                            : previewResult.status === "error"
                              ? "high"
                              : "warning"
                        }
                      />
                      <RiskTag label={previewResult.engine} tone="mixed" />
                      <RiskTag label={`Tokens ${previewResult.tokens}`} tone="warning" />
                    </div>
                    <p className="text-sm leading-7 text-text-600">{previewResult.result}</p>
                    <p className="mt-3 text-xs text-text-600">
                      Latency: {previewResult.latencyMs}ms
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-text-600">
                    这里会展示当前模型对测试文本的即时分析结果。
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-white p-6 shadow-soft">
            <h2 className="text-lg font-semibold">资源消耗估算</h2>
            <p className="mt-4 text-sm leading-7 text-text-600">
              基于当前配置，预计单次任务会使用约 {Math.round(form.contextWindow / 640)} 千 Token
              的上下文预算。提高上下文长度和并发数会增加本地显存或远端请求开销。
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
