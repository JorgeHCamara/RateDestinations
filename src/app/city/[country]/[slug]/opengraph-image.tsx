import { ImageResponse } from "next/og";
import { getCityBasic } from "@/lib/queries/cities";

export const alt = "City guide on RateDestinations";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ country: string; slug: string }>;
}) {
  const { country, slug } = await params;
  const city = await getCityBasic(country, slug);
  const name = city?.name ?? "A city";
  const sub = city ? `${city.country_name} · the whole city, rated` : "RateDestinations";
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        padding: 72,
        background: "linear-gradient(135deg, #fbf4ee 0%, #f7efe6 60%, #f2dcd0 100%)",
        color: "#2b2320",
        fontFamily: "Georgia, serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontFamily: "sans-serif",
          fontSize: 28,
          color: "#e8613c",
          letterSpacing: 4,
          textTransform: "uppercase",
        }}
      >
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "#e8613c" }} />
        RateDestinations
      </div>
      <div
        style={{ fontSize: 132, fontWeight: 600, lineHeight: 1, marginTop: 24, letterSpacing: -3 }}
      >
        {name}
      </div>
      <div style={{ fontSize: 40, marginTop: 18, color: "#6b5f58", fontFamily: "sans-serif" }}>
        {sub}
      </div>
      <div style={{ fontSize: 30, marginTop: 36, color: "#8a7d75", fontFamily: "sans-serif" }}>
        The good, the bad, and what to avoid — rated by locals and travellers.
      </div>
    </div>,
    size,
  );
}
