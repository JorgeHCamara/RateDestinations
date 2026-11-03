import { NextResponse } from "next/server";
import { searchCities } from "@/lib/queries/cities";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const hits = await searchCities(q, 8);
  return NextResponse.json(
    { hits },
    { headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
