import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        background: "#0a0a0a",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "40px",
      }}
    >
      {/* Outer glow ring */}
      <div
        style={{
          position: "absolute",
          width: "130px",
          height: "130px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(227,28,37,0.18) 0%, transparent 70%)",
          display: "flex",
        }}
      />
      {/* Circle background */}
      <div
        style={{
          width: "110px",
          height: "110px",
          borderRadius: "50%",
          background: "linear-gradient(145deg, #1a0a0a 0%, #0a0a0a 100%)",
          border: "2px solid rgba(227,28,37,0.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Play triangle */}
        <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
          <polygon points="14,8 46,26 14,44" fill="#E31C25" />
        </svg>
      </div>
    </div>,
    { ...size },
  );
}
