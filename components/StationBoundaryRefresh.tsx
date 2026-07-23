"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function StationBoundaryRefresh({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const now = Date.now();
    const boundaryMs = 15 * 60_000;
    const delay = boundaryMs - (now % boundaryMs) + 2_000;
    const timer = window.setTimeout(() => router.refresh(), delay);
    return () => window.clearTimeout(timer);
  }, [enabled, router]);
  return null;
}
