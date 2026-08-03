export const queryKeys = {
  pilot: {
    all: ["pilot"] as const,
    snapshot: (address?: string | null) =>
      [...queryKeys.pilot.all, "snapshot", address?.toLowerCase() ?? "anon"] as const,
    account: (address?: string | null) =>
      [...queryKeys.pilot.all, "account", address?.toLowerCase() ?? "anon"] as const,
  },
} as const;
