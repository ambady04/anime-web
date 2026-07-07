import { ImageResponse } from 'next/og';

export const size = {
  width: 32,
  height: 32,
};
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#070707',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '6px',
          border: '1px solid rgba(227, 28, 37, 0.25)',
        }}
      >
        <div 
          style={{ 
            display: 'flex', 
            fontSize: '9px', 
            fontWeight: '900', 
            fontFamily: 'sans-serif',
            letterSpacing: '-0.5px' 
          }}
        >
          <span style={{ color: '#FFFFFF' }}>KI</span>
          <span style={{ color: '#E31C25' }}>XO</span>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
