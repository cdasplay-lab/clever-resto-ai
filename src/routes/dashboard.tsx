import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/dashboard-page";
import { isDashboardTab } from "@/lib/dashboard-navigation";

export const Route = createFileRoute("/dashboard")({
  validateSearch: (search: Record<string, unknown>): { tab?: string; conv?: string } => ({
    tab:
      typeof search.tab === "string" && (isDashboardTab(search.tab) || search.tab === "more")
        ? search.tab
        : "overview",
    conv: typeof search.conv === "string" ? search.conv : undefined,
  }),
  component: Dashboard,
});
