import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../app/api";
import type { AppSettings } from "../app/types";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";

export function SettingsPage() {
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") === "account" ? "account" : "general";
  const [tab, setTab] = useState<"general" | "account">(initialTab);
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
    retry: false
  });
  const [form, setForm] = useState<AppSettings | null>(null);

  useEffect(() => {
    if (settingsQuery.data) {
      setForm(settingsQuery.data);
    }
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (payload: Partial<AppSettings>) => api.saveSettings(payload),
    onSuccess: async (result) => {
      setForm(result);
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
    }
  });

  return (
    <>
      <PageHeader
        title="设置"
        description="管理当前工作台的界面偏好、流程偏好和账户信息。"
        actions={
          <button
            onClick={() => form && saveMutation.mutate(form)}
            className="rounded-2xl bg-primary-500 px-5 py-3 text-sm font-semibold text-white"
          >
            保存设置
          </button>
        }
      />

      {settingsQuery.isLoading ? (
        <div className="rounded-3xl border border-border bg-white p-8 text-sm text-text-600 shadow-soft">
          正在加载设置...
        </div>
      ) : settingsQuery.isError || !form ? (
        <EmptyState
          title="设置加载失败"
          description="当前无法读取设置，请确认后端服务正常后重试。"
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)]">
          <div className="rounded-3xl border border-border bg-white p-4 shadow-soft">
            <div className="space-y-2">
              <button
                onClick={() => setTab("general")}
                className={`w-full rounded-2xl px-4 py-3 text-left text-sm font-medium ${
                  tab === "general" ? "bg-primary-50 text-primary-600" : "text-text-600"
                }`}
              >
                通用设置
              </button>
              <button
                onClick={() => setTab("account")}
                className={`w-full rounded-2xl px-4 py-3 text-left text-sm font-medium ${
                  tab === "account" ? "bg-primary-50 text-primary-600" : "text-text-600"
                }`}
              >
                账户信息
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-white p-6 shadow-soft">
            {tab === "general" ? (
              <div className="grid gap-6">
                <div>
                  <h2 className="text-xl font-semibold">界面偏好</h2>
                  <div className="mt-4 space-y-3 text-sm">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={form.appearance.compactCards}
                        onChange={(event) =>
                          setForm((current) =>
                            current
                              ? {
                                  ...current,
                                  appearance: {
                                    ...current.appearance,
                                    compactCards: event.target.checked
                                  }
                                }
                              : current
                          )
                        }
                      />
                      紧凑卡片布局
                    </label>
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={form.appearance.showRiskHints}
                        onChange={(event) =>
                          setForm((current) =>
                            current
                              ? {
                                  ...current,
                                  appearance: {
                                    ...current.appearance,
                                    showRiskHints: event.target.checked
                                  }
                                }
                              : current
                          )
                        }
                      />
                      显示风险提示
                    </label>
                  </div>
                </div>

                <div>
                  <h2 className="text-xl font-semibold">流程偏好</h2>
                  <div className="mt-4 space-y-3 text-sm">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={form.workflow.autoParseAfterUpload}
                        onChange={(event) =>
                          setForm((current) =>
                            current
                              ? {
                                  ...current,
                                  workflow: {
                                    ...current.workflow,
                                    autoParseAfterUpload: event.target.checked
                                  }
                                }
                              : current
                          )
                        }
                      />
                      上传后自动解析
                    </label>
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={form.workflow.openReportAfterDetection}
                        onChange={(event) =>
                          setForm((current) =>
                            current
                              ? {
                                  ...current,
                                  workflow: {
                                    ...current.workflow,
                                    openReportAfterDetection: event.target.checked
                                  }
                                }
                              : current
                          )
                        }
                      />
                      检测完成后优先打开报告
                    </label>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid gap-4">
                <div>
                  <h2 className="text-xl font-semibold">账户信息</h2>
                  <label className="mt-4 grid gap-2">
                    <span className="text-sm font-medium">显示名称</span>
                    <input
                      value={form.account.displayName}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                account: {
                                  ...current.account,
                                  displayName: event.target.value
                                }
                              }
                            : current
                        )
                      }
                      className="rounded-2xl border border-border px-4 py-3"
                    />
                  </label>
                  <label className="mt-4 grid gap-2">
                    <span className="text-sm font-medium">身份说明</span>
                    <input
                      value={form.account.role}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                account: {
                                  ...current.account,
                                  role: event.target.value
                                }
                              }
                            : current
                        )
                      }
                      className="rounded-2xl border border-border px-4 py-3"
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
