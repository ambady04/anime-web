'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Play, ChevronLeft, ChevronRight, Star, Calendar, Film } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { BannerItem } from '@/lib/api';

interface HeroSliderProps {
  banners: BannerItem[];
}

export default function HeroSlider({ banners }: HeroSliderProps) {
  const [current, setCurrent] = useState(0);

  // Filter out banners with missing subject or detailPath
  const activeBanners = banners.filter(b => b.detailPath || (b.subject && b.subject.detailPath));

  useEffect(() => {
    if (activeBanners.length <= 1) return;
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % activeBanners.length);
    }, 8500); // Auto rotate every 8.5 seconds
    return () => clearInterval(timer);
  }, [activeBanners.length]);

  if (activeBanners.length === 0) return null;

  const handlePrev = () => {
    setCurrent((prev) => (prev - 1 + activeBanners.length) % activeBanners.length);
  };

  const handleNext = () => {
    setCurrent((prev) => (prev + 1) % activeBanners.length);
  };

  const activeItem = activeBanners[current];
  const subject = activeItem.subject;
  const imageUrl = activeItem.image?.url || subject?.cover?.url || '';
  const title = subject?.title || activeItem.title || 'Featured Film';
  const desc = subject?.description || 'Experience the best cinematic streams with crisp quality and multiple language subtitles.';
  const rating = subject?.imdbRatingValue;
  const genres = subject?.genre || [];
  const detailPath = activeItem.detailPath || subject?.detailPath || '';

  return (
    <section className="relative w-full h-[70vh] sm:h-[80vh] overflow-hidden bg-background flex items-center transition-colors duration-300">
      {/* Background Image Carousel with Parallax */}
      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
          className="absolute inset-0 w-full h-full"
          style={{
            transform: 'translateY(calc(var(--scroll-y, 0) * 0.35px))',
            willChange: 'transform',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={title}
            className="w-full h-full object-cover select-none pointer-events-none"
          />
          {/* Gradients overlays to blend banner image with theme backgrounds */}
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent z-10 transition-colors duration-300" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/25 to-transparent z-10 transition-colors duration-300" />
        </motion.div>
      </AnimatePresence>

      {/* Slide details container */}
      <div className="max-w-[95rem] mx-auto px-4 sm:px-6 lg:px-8 w-full relative z-20 flex flex-col justify-end h-full pb-16 sm:pb-20">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="max-w-xl text-left p-6 sm:p-8 rounded-3xl glass-panel border border-glass-border shadow-card relative backdrop-blur-xl"
        >
          {/* Language/Quality Corner badge */}
          {subject?.corner && (
            <div className="inline-flex bg-primary text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider mb-4 border border-white/10 shadow-md">
              {subject.corner}
            </div>
          )}

          {/* Title */}
          <h1 className="text-2xl sm:text-3xl md:text-4.5xl font-black text-foreground leading-tight tracking-tight drop-shadow-md transition-colors duration-300">
            {title}
          </h1>

          {/* Meta Info Row */}
          <div className="flex items-center space-x-3.5 my-3.5 flex-wrap gap-y-2 select-none">
            {rating && (
              <div className="flex items-center space-x-1 bg-yellow-500/10 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-yellow-500/20">
                <Star className="w-3 h-3 text-yellow-600 fill-yellow-500" />
                <span className="text-[10px] font-bold text-yellow-600">{rating.toFixed(1)} IMDB</span>
              </div>
            )}
            
            {subject?.releaseDate && (
              <div className="flex items-center space-x-1 text-foreground/60 text-[10px] font-bold uppercase tracking-wider bg-foreground/5 border border-glass-border px-2.5 py-0.5 rounded-full">
                <Calendar className="w-3 h-3 text-primary" />
                <span>{subject.releaseDate.split('-')[0]}</span>
              </div>
            )}

            <div className="flex items-center space-x-1 text-foreground/60 text-[10px] font-bold uppercase tracking-wider bg-foreground/5 border border-glass-border px-2.5 py-0.5 rounded-full">
              <Film className="w-3 h-3 text-primary" />
              <span>{subject?.subjectType === 2 ? 'TV Series' : 'Movie'}</span>
            </div>
          </div>

          {/* Description */}
          <p className="text-foreground/75 text-xs sm:text-sm leading-relaxed line-clamp-3 mb-6 transition-colors duration-300">
            {desc}
          </p>

          {/* Action Buttons */}
          <div className="flex items-center space-x-4">
            <Link
              href={`/watch/${detailPath}`}
              className="group/btn flex items-center space-x-2 bg-primary hover:bg-primary-light text-white px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg shadow-primary-glow transition-all active:scale-95 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-white text-white group-hover/btn:scale-110 transition-transform duration-200" />
              <span>Watch Now</span>
            </Link>
          </div>
        </motion.div>
      </div>

      {/* Manual Slide navigation arrows */}
      {activeBanners.length > 1 && (
        <>
          <button
            onClick={handlePrev}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full glass-panel hover:bg-primary/10 border-glass-border hover:border-primary/20 text-foreground/60 hover:text-primary transition-all z-20 focus:outline-none cursor-pointer hidden sm:block"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={handleNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full glass-panel hover:bg-primary/10 border-glass-border hover:border-primary/20 text-foreground/60 hover:text-primary transition-all z-20 focus:outline-none cursor-pointer hidden sm:block"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Pagination Indicators Dots */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center space-x-2 z-20">
            {activeBanners.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrent(idx)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === current ? 'w-6 bg-primary' : 'w-1.5 bg-foreground/20'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
