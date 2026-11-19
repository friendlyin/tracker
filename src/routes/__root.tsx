import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { VariantSwitcher } from "../dev/VariantSwitcher";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => (
    <div className="mx-auto min-h-dvh max-w-md">
      <Outlet />
      <VariantSwitcher />
    </div>
  ),
});
