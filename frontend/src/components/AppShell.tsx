import { FormEvent, useState } from "react";
import { Bell, FileText, FlaskConical, Gauge, Search, Settings2, Sparkles } from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

const navigation = [
  { to: "/workspace", label: "工作台", icon: Gauge },
  { to: "/documents", label: "我的论文", icon: FileText },
  { to: "/reports", label: "检测报告", icon: FlaskConical },
  { to: "/rewrite", label: "改写平台", icon: Sparkles },
  { to: "/models", label: "模型配置", icon: Settings2 }
];

const titles: Record<string, string> = {
  "/workspace": "论文工作台",
  "/models": "模型配置",
  "/rewrite": "改写平台",
  "/reports": "检测报告",
  "/documents": "我的论文",
  "/search": "搜索工作台",
  "/notifications": "通知中心",
  "/help": "帮助支持",
  "/settings": "设置"
};

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const title =
    Object.entries(titles).find(([key]) => location.pathname.startsWith(key))?.[1] ??
    "论文降重工具";

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    const query = searchInput.trim();
    navigate(`/search${query ? `?q=${encodeURIComponent(query)}` : ""}`);
  };

  return (
    <div className="flex min-h-screen bg-page text-text-900">
      <aside className="hidden w-64 flex-col border-r border-border bg-white px-4 py-6 lg:flex">
        <div className="mb-8 px-3">
          <h1 className="text-2xl font-semibold">学术工作台</h1>
          <p className="mt-1 text-sm text-text-600">Paper Rewrite Studio</p>
        </div>
        <nav className="space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition",
                    isActive
                      ? "bg-primary-50 text-primary-600"
                      : "text-text-600 hover:bg-slate-50 hover:text-text-900"
                  ].join(" ")
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="mt-auto space-y-1 border-t border-border pt-4">
          <button
            onClick={() => navigate("/help")}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-text-600 hover:bg-slate-50"
          >
            <Bell className="h-4 w-4" />
            帮助支持
          </button>
          <button
            onClick={() => navigate("/settings")}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-text-600 hover:bg-slate-50"
          >
            <Settings2 className="h-4 w-4" />
            设置
          </button>
        </div>
      </aside>

      <main className="flex-1">
        <header className="sticky top-0 z-10 border-b border-border bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
            <div>
              <p className="text-sm text-text-600">论文降重工具 v1</p>
              <h2 className="text-xl font-semibold">{title}</h2>
            </div>
            <div className="flex items-center gap-3">
              <form
                onSubmit={handleSearch}
                className="hidden items-center gap-2 rounded-full border border-border bg-slate-50 px-4 py-2 text-sm text-text-600 md:flex"
              >
                <Search className="h-4 w-4" />
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="搜索工作台..."
                  className="w-32 bg-transparent outline-none lg:w-40"
                />
              </form>
              <button
                onClick={() => navigate("/notifications")}
                className="rounded-full border border-border p-2 text-text-600"
              >
                <Bell className="h-4 w-4" />
              </button>
              <button
                onClick={() => navigate("/settings?tab=account")}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-primary-600"
              >
                AI
              </button>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-6 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
