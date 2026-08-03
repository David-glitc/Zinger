"use client";

import { useQuery } from "@tanstack/react-query";
import {
  chartResolution,
  getMarketDetail,
  getPriceHistory,
  type PricePoint,
} from "@/lib/api";

export function useMarketDetail(slug?: string | null) {
  return useQuery({
    queryKey: ["market-detail", slug],
    queryFn: () => getMarketDetail(slug as string),
    enabled: !!slug,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

export function usePriceHistory(tokenId?: string | null, duration?: string | null) {
  const { interval, fidelity } = chartResolution(duration);
  return useQuery({
    queryKey: ["price-history", tokenId, interval, fidelity],
    queryFn: () => getPriceHistory(tokenId as string, interval, fidelity),
    enabled: !!tokenId,
    staleTime: 10_000,
    refetchInterval: 15_000,
    select: (data) => data.history as PricePoint[],
  });
}

/** Full chart data bundle for one event slug: detail + token history. */
export function useMarketChart(slug?: string | null, duration?: string | null) {
  const detailQuery = useMarketDetail(slug);
  const detail = detailQuery.data;
  const tokenId = detail?.clobTokenIds?.[0] ?? null;
  const historyQuery = usePriceHistory(tokenId, duration);
  return {
    detail,
    detailError: detailQuery.error,
    detailLoading: detailQuery.isLoading,
    history: historyQuery.data ?? [],
    historyError: historyQuery.error,
    historyLoading: historyQuery.isLoading,
    tokenId,
  };
}
