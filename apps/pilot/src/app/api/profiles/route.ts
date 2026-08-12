import { NextResponse } from "next/server";
import { normalizeAddress } from "@/lib/pilot-db";
import { getCollection } from "@/lib/mongo";
import { getAuth, canAccessAccount, unauthorized, forbidden } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const wallet = normalizeAddress(searchParams.get("wallet") || "");
    const listMode = searchParams.get("list") === "true";

    const col = await getCollection("pilot_accounts");

    if (wallet && !listMode) {
      const doc = await col.findOne(
        { wallet },
        {
          projection: {
            wallet: 1,
            profile: 1,
            createdAt: 1,
            _id: 0,
          },
        },
      );
      if (!doc) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(doc);
    }

    const cursor = col
      .find(
        { "profile.public": true },
        {
          projection: {
            wallet: 1,
            profile: 1,
            createdAt: 1,
            _id: 0,
          },
          sort: { "profile.stats.totalVolume": -1 },
          limit: 50,
        },
      );

    const profiles = await cursor.toArray();
    return NextResponse.json({ profiles });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const wallet = normalizeAddress(body.wallet || "");
    if (!wallet) {
      return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
    }

    const auth = await getAuth();
    if (!auth) return unauthorized();
    if (!canAccessAccount(auth, wallet)) return forbidden();

    const profile = {
      username: String(body.username || "").slice(0, 30) || null,
      displayName: String(body.displayName || "").slice(0, 50) || null,
      bio: String(body.bio || "").slice(0, 200) || null,
      avatarUrl: String(body.avatarUrl || "").slice(0, 300) || null,
      xHandle: String(body.xHandle || "").slice(0, 50) || null,
      public: body.public !== false,
      updatedAt: Date.now(),
    };

    const col = await getCollection("pilot_accounts");
    const existing = await col.findOne({ wallet });
    if (!existing) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    await col.updateOne(
      { wallet },
      {
        $set: {
          profile: {
            ...((existing as Record<string, unknown>).profile as Record<string, unknown> || {}),
            ...profile,
          },
          updatedAt: Date.now(),
        },
      },
    );

    return NextResponse.json({ ok: true, profile });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
