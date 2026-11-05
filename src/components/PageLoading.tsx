import { useEffect, useState } from "react";
import { useIsFetching } from "@tanstack/react-query";
import { useDelayedFlag } from "../hooks/useDelayedFlag";

/**
 * Тонкая полоса загрузки у каждой страницы.
 * Появляется только если навигация или запрос данных занимает больше 30 мс,
 * чтобы мгновенные переходы не мигали.
 */
export default function PageLoading({ routeKey }: { routeKey: string }) {
  const fetching = useIsFetching();
  const [settledRoute, setSettledRoute] = useState(routeKey);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setSettledRoute(routeKey));
    return () => window.cancelAnimationFrame(frame);
  }, [routeKey]);

  const navigating = settledRoute !== routeKey;
  const visible = useDelayedFlag(fetching > 0 || navigating, 30);
  if (!visible) return null;

  return (
    <div
      className="route-loader"
      role="progressbar"
      aria-label="Страница загружается"
      aria-valuetext="Загрузка"
    />
  );
}
