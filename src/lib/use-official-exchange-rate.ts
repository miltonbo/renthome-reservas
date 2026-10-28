"use client";

import { useEffect, useState } from "react";

export type OfficialExchangeRateResponse = {
  bobPerUsd: number;
  effectiveDate: string;
  fetchedAt: string;
  stale?: boolean;
  source?: string;
};

export function useOfficialExchangeRate() {
  const [rate, setRate] = useState<OfficialExchangeRateResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const load = () => {
      fetch("/api/finance/exchange-rate", { signal: controller.signal })
        .then((response) => response.ok ? response.json() : null)
        .then((data) => setRate(data))
        .catch(() => {})
        .finally(() => setLoading(false));
    };
    const refreshOnFocus = () => load();
    load();
    const interval = window.setInterval(load, 15 * 60 * 1000);
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, []);

  return { rate, loading };
}
