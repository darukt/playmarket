import { useEffect, useState } from "react";

/**
 * Показывает индикатор только если состояние ожидания длится дольше delay.
 * Быстрые переходы не мигают загрузкой; застрявшие — показывают прогресс.
 */
export function useDelayedFlag(active: boolean, delay = 30): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      // Сброс асинхронный, чтобы не вызывать setState синхронно внутри эффекта.
      const reset = window.setTimeout(() => setVisible(false), 0);
      return () => window.clearTimeout(reset);
    }
    const timer = window.setTimeout(() => setVisible(true), delay);
    return () => window.clearTimeout(timer);
  }, [active, delay]);

  return visible;
}
