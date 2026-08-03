"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import { getIntelligence, getGeoblock, type IntelligenceData, type GeoblockStatus } from "@/lib/intelligence";

export function useIntelligence(enabled = true) {
  return useQuery<IntelligenceData>({
    queryKey: ["intelligence"],
    queryFn: getIntelligence,
    enabled,
    refetchInterval: 5_000,
    staleTime: 2_000,
    retry: 1,
  });
}

export function useGeoblock() {
  return useQuery<GeoblockStatus>({
    queryKey: ["geoblock"],
    queryFn: getGeoblock,
    refetchInterval: 30_000,
    staleTime: 10_000,
    retry: 1,
  });
}

export function useDashboardIntelligence() {
  return useQueries({
    queries: [
      {
        queryKey: ["intelligence"],
        queryFn: getIntelligence,
        refetchInterval: 5_000,
        staleTime: 2_000,
      },
      {
        queryKey: ["geoblock"],
        queryFn: getGeoblock,
        refetchInterval: 30_000,
        staleTime: 10_000,
      },
    ],
  });
}
