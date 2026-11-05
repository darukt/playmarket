export type Route =
  | { name: "today" }
  | { name: "chart" }
  | { name: "games" }
  | { name: "game"; slug: string }
  | { name: "installed" }
  | { name: "wishlist" }
  | { name: "app"; id: string }
  | { name: "notfound"; path: string };

export interface RouteTarget {
  kind?: "app" | "web";
  id: string;
  game?: string;
}

/** Where a catalog entry leads: web games live at /games/:slug, apps at /apps/:id */
export function routeForApp(app: RouteTarget): Route {
  if (app.kind === "web" && app.game) return { name: "game", slug: app.game };
  return { name: "app", id: app.id };
}

export function pathFor(route: Route): string {
  switch (route.name) {
    case "today":
      return "/";
    case "chart":
      return "/chart";
    case "games":
      return "/games";
    case "game":
      return `/games/${encodeURIComponent(route.slug)}`;
    case "installed":
      return "/installed";
    case "wishlist":
      return "/wishlist";
    case "app":
      return `/apps/${encodeURIComponent(route.id)}`;
    case "notfound":
      return route.path;
  }
}

export function parsePath(pathname: string): Route {
  let parts: string[];
  try { parts = pathname.split("/").filter(Boolean).map(decodeURIComponent); }
  catch { return { name: "notfound", path: pathname }; }
  if (parts.length === 0) return { name: "today" };
  if (parts[0] === "chart" && parts.length === 1) return { name: "chart" };
  if (parts[0] === "games" && parts.length === 1) return { name: "games" };
  if (parts[0] === "games" && parts.length === 2) return { name: "game", slug: parts[1] };
  if (parts[0] === "installed" && parts.length === 1) return { name: "installed" };
  if (parts[0] === "wishlist" && parts.length === 1) return { name: "wishlist" };
  if (parts[0] === "apps" && parts.length === 2) return { name: "app", id: parts[1] };
  return { name: "notfound", path: pathname };
}
