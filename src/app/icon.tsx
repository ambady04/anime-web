import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        background: "#0a0a0a",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "8px",
      }}
    >
      {/* Red play triangle */}
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <polygon points="4,2 16,9 4,16" fill="#E31C25" />
      </svg>
    </div>,
    { ...size },
  );
}
