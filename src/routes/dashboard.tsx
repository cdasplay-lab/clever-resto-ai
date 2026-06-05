import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/dashboard-page";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
});
