"use client";

import { useCallback } from "react";
import { useAccount, useSignTypedData } from "wagmi";

const CLOB_AUTH_DOMAIN = {
  name: "ClobAuthDomain",
  version: "1",
  chainId: 137,
} as const;

const CLOB_AUTH_TYPES = {
  ClobAuth: [
    { name: "address", type: "address" },
    { name: "timestamp", type: "string" },
    { name: "nonce", type: "uint256" },
    { name: "message", type: "string" },
  ],
} as const;

const POLY_AUTH_MSG = "This message attests that I control the given wallet";

export function useClobProvision() {
  const { address } = useAccount();
  const { signTypedDataAsync, isPending, error } = useSignTypedData();

  const provision = useCallback(async (): Promise<{
    signature: string;
    timestamp: string;
    nonce: string;
    address: string;
  }> => {
    if (!address) throw new Error("Wallet not connected");

    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = "0";

    const signature = await signTypedDataAsync({
      domain: CLOB_AUTH_DOMAIN,
      types: CLOB_AUTH_TYPES,
      primaryType: "ClobAuth",
      message: {
        address: address as `0x${string}`,
        timestamp,
        nonce: BigInt(nonce),
        message: POLY_AUTH_MSG,
      },
    });

    return { signature, timestamp, nonce, address };
  }, [address, signTypedDataAsync]);

  return { provision, isPending, error };
}
