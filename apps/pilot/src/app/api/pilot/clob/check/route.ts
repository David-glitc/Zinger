import { NextResponse } from "next/server";
import { createPublicClient, http, formatUnits } from "viem";
import { polygon } from "viem/chains";
import { normalizeAddress } from "@/lib/pilot-db";
import { getAuth, canAccessAccount, unauthorized, forbidden } from "@/lib/auth";
import { routeError } from "@/lib/logger";

const RPC_URL = process.env.POLYGON_RPC_URL || "https://polygon-bor.publicnode.com";
const USDC_ADDRESS = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const ERC20_BALANCE_ABI = [
  {
    constant: true,
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const THRESHOLDS = {
  poly: 0.05,
  usdc: 5,
};

const publicClient = createPublicClient({
  chain: polygon,
  transport: http(RPC_URL),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const address = normalizeAddress(searchParams.get("address") || "");
    if (!address) {
      return NextResponse.json({ error: "address required" }, { status: 400 });
    }

    const auth = await getAuth();
    if (!auth) return unauthorized();
    if (!canAccessAccount(auth, address)) return forbidden();

    const [polWei, usdcRaw] = await Promise.all([
      publicClient.getBalance({ address: address as `0x${string}` }),
      publicClient.readContract({
        address: USDC_ADDRESS,
        abi: ERC20_BALANCE_ABI,
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      }),
    ]);

    const polyBalance = Number(formatUnits(polWei, 18));
    const usdcBalance = Number(formatUnits(usdcRaw, 6));

    return NextResponse.json({
      address,
      chainId: 137,
      polyBalance,
      usdcBalance,
      needsPoly: polyBalance < THRESHOLDS.poly,
      needsUsdc: usdcBalance < THRESHOLDS.usdc,
      canProvision: polyBalance >= THRESHOLDS.poly,
      canTrade: polyBalance >= THRESHOLDS.poly && usdcBalance >= THRESHOLDS.usdc,
      thresholds: THRESHOLDS,
      checkedAt: Date.now(),
    });
  } catch (err) {
    return routeError("pilot.clob.check", err, request);
  }
}
