import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../app/api";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { RiskTag } from "../components/RiskTag";

export function NotificationsPage() {
  const navigate = useNavigate();
  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: api.getNotifications,
    retry: false
  });

  const items = notificationsQuery.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="通知中心"
        description="查看最近的论文、检测、改写和导出相关动态。"
      />

      {notificationsQuery.isLoading ? (
        <div className="rounded-3xl border border-border bg-white p-8 text-sm text-text-600 shadow-soft">
          正在加载通知...
        </div>
      ) : notificationsQuery.isError ? (
        <EmptyState
          title="通知加载失败"
          description="当前无法读取通知，请确认后端服务正常后重试。"
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="当前没有通知"
          description="等你继续上传、检测或改写论文后，这里会出现新的动态。"
        />
      ) : (
        <div className="grid gap-4">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.route)}
              className="rounded-3xl border border-border bg-white p-6 text-left shadow-soft"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold">{item.title}</p>
                  {item.paperTitle ? (
                    <p className="mt-2 text-sm font-medium text-text-900">
                      论文名称：{item.paperTitle}
                    </p>
                  ) : null}
                  <p className="mt-2 text-sm leading-7 text-text-600">{item.description}</p>
                  <p className="mt-3 text-xs text-text-600">
                    {new Date(item.createdAt).toLocaleString("zh-CN")}
                  </p>
                </div>
                <RiskTag
                  label={item.level}
                  tone={
                    item.level === "warning"
                      ? "warning"
                      : item.level === "success"
                        ? "safe"
                        : "mixed"
                  }
                />
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
