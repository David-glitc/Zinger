"use client";

import { useQuery } from "@tanstack/react-query";
import { getOrderBook, type OrderBookDepth } from "@/lib/api";

/**
 * Live CLOB order book for one outcome token. Polls the CLOB /book via the
 * Vercel proxy every ~2s and merges the streaming best bid/ask when present.
 */
export function useClobDepth(tokenId?: string | null) {
  return useQuery({
    queryKey: ["clob-depth", tokenId],
    queryFn: () => getOrderBook(tokenId as string),
    enabled: !!tokenId,
    staleTime: 1_500,
    refetchInterval: 2_000,
    select: (d) => d as OrderBookDepth,
  });
}
