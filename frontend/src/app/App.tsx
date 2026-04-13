import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { WorkspacePage } from "../pages/WorkspacePage";
import { DocumentsPage } from "../pages/DocumentsPage";
import { DocumentDetailPage } from "../pages/DocumentDetailPage";
import { SearchPage } from "../pages/SearchPage";
import { NotificationsPage } from "../pages/NotificationsPage";
import { HelpPage } from "../pages/HelpPage";
import { SettingsPage } from "../pages/SettingsPage";
import { ReportsIndexPage } from "../pages/ReportsIndexPage";
import { ReportPage } from "../pages/ReportPage";
import { RewriteIndexPage } from "../pages/RewriteIndexPage";
import { RewritePage } from "../pages/RewritePage";
import { ModelsPage } from "../pages/ModelsPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/workspace" replace />} />
      <Route element={<AppShell />}>
        <Route path="/workspace" element={<WorkspacePage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/documents/:docId" element={<DocumentDetailPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/reports" element={<ReportsIndexPage />} />
        <Route path="/reports/:taskId" element={<ReportPage />} />
        <Route path="/rewrite" element={<RewriteIndexPage />} />
        <Route path="/rewrite/:docId" element={<RewritePage />} />
        <Route path="/models" element={<ModelsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/workspace" replace />} />
    </Routes>
  );
}
