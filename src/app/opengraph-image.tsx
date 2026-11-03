import { ImageResponse } from "next/og";

export const alt = "RateDestinations — the whole city, rated";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 80,
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
        style={{
          fontSize: 96,
          fontWeight: 600,
          lineHeight: 1.05,
          marginTop: 28,
          letterSpacing: -2,
        }}
      >
        Know a city before you go.
      </div>
      <div style={{ fontSize: 44, marginTop: 20, color: "#6b5f58", fontFamily: "sans-serif" }}>
        The good and the bad, rated by travellers.
      </div>
    </div>,
    size,
  );
}
