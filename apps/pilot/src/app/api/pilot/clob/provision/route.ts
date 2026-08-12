import { NextResponse } from "next/server";
import { normalizeAddress } from "@/lib/pilot-db";
import { getCollection } from "@/lib/mongo";
import { encryptSecret } from "@/lib/crypto";
import { getAuth, canAccessAccount, unauthorized, forbidden } from "@/lib/auth";
import { routeError } from "@/lib/logger";

const CLOB_AUTH_URL = "https://clob.polymarket.com/auth/api-key";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const address = normalizeAddress(body.address || "");
    if (!address) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    const auth = await getAuth();
    if (!auth) return unauthorized();
    if (!canAccessAccount(auth, address)) return forbidden();

    const signature = String(body.signature || "");
    const timestamp = String(body.timestamp || "");
    const nonce = String(body.nonce ?? "0");

    if (!signature || !timestamp) {
      return NextResponse.json({ error: "signature and timestamp required" }, { status: 400 });
    }

    const res = await fetch(CLOB_AUTH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        POLY_ADDRESS: address,
        POLY_SIGNATURE: signature,
        POLY_TIMESTAMP: timestamp,
        POLY_NONCE: nonce,
      },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `CLOB auth failed: ${res.status} ${errText}` },
        { status: 502 },
      );
    }

    const creds = await res.json();

    const col = await getCollection("pilot_accounts");
    await col.updateOne(
      { wallet: address },
      {
        $set: {
          clobApiKey: creds.apiKey,
          clobApiSecret: encryptSecret(creds.secret),
          clobApiPassphrase: encryptSecret(creds.passphrase),
          updatedAt: Date.now(),
        },
      },
    );

    return NextResponse.json({
      ok: true,
      apiKey: creds.apiKey,
    });
  } catch (err) {
    return routeError("pilot.clob.provision", err, request);
  }
}

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

    const col = await getCollection("pilot_accounts");
    const doc = await col.findOne({ wallet: address });
    if (!doc) {
      return NextResponse.json({ provisioned: false }, { status: 404 });
    }

    const acct = doc as Record<string, unknown>;
    const key = String(acct.clobApiKey || "");
    const provisioned = key.length > 8;

    return NextResponse.json({
      provisioned,
      hasApiKey: provisioned,
    });
  } catch (err) {
    return routeError("pilot.clob.provision", err, request);
  }
}
