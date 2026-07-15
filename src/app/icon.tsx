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
      {/* Overlapping diamonds SVG logo */}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L5 9L12 16L19 9L12 2Z" fill="#E31C25" fillOpacity="0.9" />
        <path d="M12 8L5 15L12 22L19 15L12 8Z" fill="#222222" />
      </svg>
    </div>,
    { ...size },
  );
}
