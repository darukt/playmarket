import { useEffect, useRef, useState } from "react";

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => setReduced(media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  return reduced;
}

/** Never let a hidden tab or lost window keep a real-time game running. */
export function usePauseWhenHidden(pause: () => void) {
  const pauseRef = useRef(pause);
  useEffect(() => { pauseRef.current = pause; }, [pause]);
  useEffect(() => {
    const hidden = () => { if (document.hidden) pauseRef.current(); };
    const blur = () => pauseRef.current();
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("blur", blur);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("blur", blur);
    };
  }, []);
}
