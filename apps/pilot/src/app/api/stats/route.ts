import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongo";

export async function GET() {
  try {
    const col = await getCollection("pilot_accounts");

    const [agg] = await col
      .aggregate([
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            totalDeposited: { $sum: { $toDouble: "$depositedGross" } },
            totalCash: { $sum: { $toDouble: "$cash" } },
            liveUsers: { $sum: { $cond: [{ $eq: ["$mode", "live"] }, 1, 0] } },
            activeSessions: {
              $sum: { $cond: [{ $eq: ["$session.running", true] }, 1, 0] },
            },
            clobProvisioned: {
              $sum: {
                $cond: [
                  { $gt: [{ $strLenCP: { $ifNull: ["$clobApiKey", ""] } }, 8] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ])
      .toArray();

    return NextResponse.json({
      tvl: Number(agg?.totalDeposited ?? 0),
      totalCash: Number(agg?.totalCash ?? 0),
      totalUsers: Number(agg?.totalUsers ?? 0),
      liveUsers: Number(agg?.liveUsers ?? 0),
      activeSessions: Number(agg?.activeSessions ?? 0),
      clobProvisioned: Number(agg?.clobProvisioned ?? 0),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
