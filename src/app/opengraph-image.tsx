import { ImageResponse } from 'next/og';

export const alt = 'KIXO - Premium Streaming Hub';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#070707',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {/* Ambient Glows */}
        <div
          style={{
            position: 'absolute',
            top: '-20%',
            left: '10%',
            width: '600px',
            height: '600px',
            background: 'radial-gradient(circle, rgba(227, 28, 37, 0.12), transparent 70%)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-10%',
            right: '10%',
            width: '500px',
            height: '500px',
            background: 'radial-gradient(circle, rgba(227, 28, 37, 0.06), transparent 70%)',
            display: 'flex',
          }}
        />

        {/* Brand Container Box */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            background: 'rgba(10, 10, 10, 0.75)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '50px 70px',
            borderRadius: '36px',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.85)',
          }}
        >
          {/* Logo Section */}
          <div
            style={{
              display: 'flex',
              position: 'relative',
              width: '90px',
              height: '90px',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '24px',
            }}
          >
            {/* Overlapping diamonds logo in SVG style */}
            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L5 9L12 16L19 9L12 2Z" fill="#E31C25" fillOpacity="0.95" />
              <path d="M12 8L5 15L12 22L19 15L12 8Z" fill="#1A1A1A" fillOpacity="0.85" />
            </svg>
          </div>

          {/* Brand Name */}
          <div
            style={{
              fontSize: '80px',
              fontWeight: '900',
              letterSpacing: '4px',
              display: 'flex',
              fontFamily: 'sans-serif',
            }}
          >
            <span style={{ color: '#FFFFFF' }}>KI</span>
            <span style={{ color: '#E31C25' }}>XO</span>
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: '20px',
              color: 'rgba(255, 255, 255, 0.6)',
              marginTop: '12px',
              fontWeight: '500',
              letterSpacing: '1px',
              display: 'flex',
              fontFamily: 'sans-serif',
            }}
          >
            Premium Movie & Series Stream Hub
          </div>

          {/* powered by tagline */}
          <div
            style={{
              fontSize: '11px',
              color: '#E31C25',
              marginTop: '36px',
              fontWeight: '800',
              letterSpacing: '2px',
              display: 'flex',
              fontFamily: 'sans-serif',
            }}
          >
            POWERED BY ABISOLUTIONS.ONLINE
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
