'use client';

import { useEffect } from 'react';

export default function ScrollHandler() {
  useEffect(() => {
    const handleScroll = () => {
      const scrolled = window.scrollY;
      document.documentElement.style.setProperty('--scroll-y', scrolled.toString());
      
      const maxScroll = 300;
      const scrollRatio = Math.min(scrolled / maxScroll, 1);
      // Blur range: 20px (initial) to 32px (fully scrolled)
      const blurVal = 20 + scrollRatio * 12;
      document.documentElement.style.setProperty('--scroll-blur', `${blurVal}px`);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial call
    
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return null;
}
