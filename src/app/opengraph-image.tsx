import { ImageResponse } from "next/og";

export const alt = "KIXO — Stream Anime, Movies & Series";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    <div
      style={{
        background: "#080808",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        fontFamily: "sans-serif",
      }}
    >
      {/* ── Background noise grain overlay ── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E\")",
          display: "flex",
        }}
      />

      {/* ── Large red ambient glow — top left ── */}
      <div
        style={{
          position: "absolute",
          top: "-180px",
          left: "-80px",
          width: "700px",
          height: "700px",
          background:
            "radial-gradient(circle, rgba(227,28,37,0.20) 0%, rgba(227,28,37,0.05) 45%, transparent 70%)",
          display: "flex",
        }}
      />

      {/* ── Subtle glow — bottom right ── */}
      <div
        style={{
          position: "absolute",
          bottom: "-120px",
          right: "-60px",
          width: "500px",
          height: "500px",
          background:
            "radial-gradient(circle, rgba(227,28,37,0.10) 0%, transparent 65%)",
          display: "flex",
        }}
      />

      {/* ── Horizontal accent line ── */}
      <div
        style={{
          position: "absolute",
          top: "0",
          left: "0",
          right: "0",
          height: "3px",
          background:
            "linear-gradient(90deg, transparent 0%, #E31C25 30%, #ff4d55 50%, #E31C25 70%, transparent 100%)",
          display: "flex",
        }}
      />

      {/* ── Main content — centered ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          flex: 1,
          gap: "0px",
        }}
      >
        {/* Logo mark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "96px",
            height: "96px",
            borderRadius: "50%",
            background: "rgba(227,28,37,0.10)",
            border: "1.5px solid rgba(227,28,37,0.35)",
            marginBottom: "32px",
          }}
        >
          <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
            <polygon points="12,7 38,22 12,37" fill="#E31C25" />
          </svg>
        </div>

        {/* Brand wordmark */}
        <div
          style={{
            display: "flex",
            fontSize: "96px",
            fontWeight: "900",
            letterSpacing: "6px",
            lineHeight: 1,
            marginBottom: "20px",
          }}
        >
          <span style={{ color: "#ffffff" }}>KI</span>
          <span style={{ color: "#E31C25" }}>XO</span>
        </div>

        {/* Divider */}
        <div
          style={{
            width: "48px",
            height: "3px",
            background: "#E31C25",
            borderRadius: "2px",
            marginBottom: "20px",
            display: "flex",
          }}
        />

        {/* Tagline */}
        <div
          style={{
            fontSize: "24px",
            color: "rgba(255,255,255,0.65)",
            fontWeight: "500",
            letterSpacing: "1.5px",
            display: "flex",
          }}
        >
          Stream Anime, Movies &amp; Series
        </div>

        {/* Pills row */}
        <div
          style={{
            display: "flex",
            gap: "12px",
            marginTop: "36px",
          }}
        >
          {["HD Quality", "Subtitles", "Dub & Sub", "Free"].map((label) => (
            <div
              key={label}
              style={{
                display: "flex",
                padding: "8px 20px",
                borderRadius: "100px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.10)",
                fontSize: "13px",
                fontWeight: "700",
                color: "rgba(255,255,255,0.55)",
                letterSpacing: "0.5px",
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom URL strip ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "18px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <span
          style={{
            fontSize: "13px",
            fontWeight: "700",
            color: "rgba(255,255,255,0.25)",
            letterSpacing: "2px",
          }}
        >
          KIXO.TO
        </span>
      </div>
    </div>,
    { ...size },
  );
}
