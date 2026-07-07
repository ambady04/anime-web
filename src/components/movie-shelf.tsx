'use client';

import { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import MovieCard from './movie-card';
import { Subject } from '@/lib/api';

interface MovieShelfProps {
  title: string;
  subjects: Subject[];
}

export default function MovieShelf({ title, subjects }: MovieShelfProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  const checkScroll = () => {
    if (rowRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = rowRef.current;
      setShowLeftArrow(scrollLeft > 10);
      // Allow minor subpixel calculation error in browsers
      setShowRightArrow(scrollLeft + clientWidth < scrollWidth - 15);
    }
  };

  useEffect(() => {
    const el = rowRef.current;
    if (el) {
      el.addEventListener('scroll', checkScroll);
      // Initial check
      checkScroll();
      
      // Recheck when window resizing
      window.addEventListener('resize', checkScroll);
    }
    return () => {
      if (el) el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [subjects]);

  const handleScroll = (direction: 'left' | 'right') => {
    if (rowRef.current) {
      const { clientWidth, scrollLeft } = rowRef.current;
      const scrollTo = direction === 'left' 
        ? scrollLeft - clientWidth * 0.75 
        : scrollLeft + clientWidth * 0.75;
      
      rowRef.current.scrollTo({
        left: scrollTo,
        behavior: 'smooth'
      });
    }
  };

  if (!subjects || subjects.length === 0) return null;

  return (
    <div className="relative group/shelf my-10 max-w-[95rem] mx-auto px-4 sm:px-6 lg:px-8 z-20">
      {/* Title */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg sm:text-xl font-black tracking-wider uppercase text-foreground relative inline-block transition-colors select-none">
          {title}
          <span className="absolute bottom-0 left-0 w-8 h-[2.5px] bg-primary rounded-full transition-all duration-300 group-hover/shelf:w-16 shadow-[0_0_8px_rgba(227,28,37,0.5)]" />
        </h2>
      </div>

      {/* Row container */}
      <div className="relative flex items-center">
        {/* Left Arrow Button */}
        {showLeftArrow && (
          <button
            onClick={() => handleScroll('left')}
            className="absolute left-2 z-30 p-2.5 rounded-full glass-panel hover:bg-primary/10 border-glass-border hover:border-primary/20 text-foreground/50 hover:text-primary transition-all shadow-md scale-90 group-hover/shelf:scale-100 opacity-0 group-hover/shelf:opacity-100 focus:outline-none cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}

        {/* Scrollable list */}
        <div
          ref={rowRef}
          className="flex overflow-x-auto space-x-4 py-4 px-2 no-scrollbar scroll-smooth w-full select-none"
        >
          {subjects.map((subject) => (
            <div
              key={subject.subjectId}
              className="flex-shrink-0 w-[140px] sm:w-[170px] md:w-[190px] lg:w-[210px]"
            >
              <MovieCard subject={subject} />
            </div>
          ))}
        </div>

        {/* Right Arrow Button */}
        {showRightArrow && (
          <button
            onClick={() => handleScroll('right')}
            className="absolute right-2 z-30 p-2.5 rounded-full glass-panel hover:bg-primary/10 border-glass-border hover:border-primary/20 text-foreground/50 hover:text-primary transition-all shadow-md scale-90 group-hover/shelf:scale-100 opacity-0 group-hover/shelf:opacity-100 focus:outline-none cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
