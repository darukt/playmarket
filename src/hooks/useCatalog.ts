import { useQuery } from "@tanstack/react-query";
import { apps, type CatalogApp } from "../data/apps";
import { api, ApiError } from "../services/api";
import { normalizeApp, normalizeCatalog } from "../services/catalog";

/** Render the bundled snapshot immediately, then refresh through the public gateway. */
export function useCatalog(): CatalogApp[] {
  const { data } = useQuery({
    queryKey: ["catalog"],
    queryFn: async ({ signal }) => normalizeCatalog(await api<unknown>("/api/catalog", { signal })),
    initialData: apps,
    initialDataUpdatedAt: 0,
    staleTime: 60_000,
  });
  // Query errors retain the last successful data instead of discarding custom apps.
  return data;
}

export function useApp(id: string): CatalogApp | undefined {
  const catalog = useCatalog();
  const { data } = useQuery({
    queryKey: ["app", id],
    queryFn: async ({ signal }) => {
      try {
        const row = normalizeApp(await api<unknown>(`/api/apps/${encodeURIComponent(id)}`, { signal }));
        if (!row || row.id !== id) throw new Error("Invalid app response");
        return row;
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    initialData: () => catalog.find((app) => app.id === id),
    initialDataUpdatedAt: 0,
    staleTime: 60_000,
  });
  return data ?? undefined;
}
