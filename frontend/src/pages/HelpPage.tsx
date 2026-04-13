import { useQuery } from "@tanstack/react-query";
import { api } from "../app/api";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";

export function HelpPage() {
  const helpQuery = useQuery({
    queryKey: ["help"],
    queryFn: api.getHelp,
    retry: false
  });

  return (
    <>
      <PageHeader
        title="帮助支持"
        description="查看本地使用说明、常见问题和当前版本的工作方式。"
      />

      {helpQuery.isLoading ? (
        <div className="rounded-3xl border border-border bg-white p-8 text-sm text-text-600 shadow-soft">
          正在加载帮助内容...
        </div>
      ) : helpQuery.isError ? (
        <EmptyState
          title="帮助内容加载失败"
          description="当前无法读取帮助信息，请确认后端服务正常后重试。"
        />
      ) : helpQuery.data ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-3xl border border-border bg-white p-6 shadow-soft">
            <h2 className="text-xl font-semibold">推荐使用流程</h2>
            <div className="mt-4 grid gap-3">
              {(helpQuery.data.workflow ?? []).map((item) => (
                <div key={item.id} className="rounded-2xl border border-border bg-slate-50/60 p-4">
                  <p className="font-semibold">{item.title}</p>
                  <p className="mt-2 text-sm leading-7 text-text-600">{item.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-white p-6 shadow-soft xl:col-span-2">
            <h2 className="text-xl font-semibold">常见问题</h2>
            <div className="mt-4 grid gap-3">
              {(helpQuery.data.items ?? []).map((item) => (
                <div key={item.id} className="rounded-2xl border border-border bg-slate-50/60 p-4">
                  <p className="font-semibold">{item.title}</p>
                  <p className="mt-2 text-sm leading-7 text-text-600">{item.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-white p-6 shadow-soft">
            <h2 className="text-xl font-semibold">学术使用提醒</h2>
            <div className="mt-4 grid gap-3">
              {(helpQuery.data.warnings ?? []).map((item) => (
                <div key={item} className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                  <p className="text-sm leading-7 text-text-600">{item}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-white p-6 shadow-soft">
            <h2 className="text-xl font-semibold">当前支持方式</h2>
            <p className="mt-4 text-sm leading-7 text-text-600">
              渠道：{helpQuery.data.contact.channel}
            </p>
            <p className="mt-3 text-sm leading-7 text-text-600">
              {helpQuery.data.contact.note}
            </p>
            <div className="mt-4 rounded-2xl bg-slate-50/70 p-4">
              <p className="text-sm font-semibold">建议优先查看</p>
              <div className="mt-3 grid gap-2">
                {(helpQuery.data.contact.docs ?? []).map((item) => (
                  <p key={item} className="text-sm text-text-600">
                    {item}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
