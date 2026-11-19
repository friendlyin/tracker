import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

// Placeholder home screen. The widget grid arrives in iteration 1.
function Home() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => (await fetch("/api/health")).json() as Promise<{ ok: boolean }>,
  });

  return (
    <div className="flex items-center justify-between py-4">
      <span className="text-sm font-medium">Health</span>
      <span
        className={`size-2 ${health.data?.ok ? "bg-green-600" : "bg-neutral-300"}`}
        title="api"
      />
    </div>
  );
}
