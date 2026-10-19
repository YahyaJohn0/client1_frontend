import React, { useState, useEffect } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import type { Banner } from '../types/store.ts';
import { api } from '../services/api.ts';
import { useStore } from '../context/StoreContext.tsx';

export const HeroBanner: React.FC = () => {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const { setActiveTab, setSelectedCategory } = useStore();

  useEffect(() => {
    api.getBanners().then(res => {
      if (res.banners && res.banners.length > 0) {
        setBanners(res.banners);
      }
    }).catch(err => console.error('Failed to load banners:', err));
  }, []);

  const banner = banners[currentIndex] || {
    id: 'default',
    title: 'Salon-Grade Styling At Home',
    subtitle: 'Discover our signature thermal hairbrushes, cushion paddles & vanity organizers.',
    badgeText: 'New Collection',
    imageUrl: '/src/assets/images/hero_lifestyle_store_1792058412869.jpg',
    ctaText: 'Shop Collection',
    linkUrl: '#collection'
  };

  const handleCta = () => {
    setSelectedCategory('all');
    setActiveTab('shop');
  };

  return (
    <section className="relative overflow-hidden rounded-2xl md:rounded-3xl bg-slate-900 mx-4 sm:mx-6 my-4 shadow-sm">
      <div className="relative min-h-[360px] sm:min-h-[420px] md:min-h-[480px] flex items-end sm:items-center">
        {/* Background Image with Optical Scrim */}
        <div className="absolute inset-0 z-0">
          <img
            src={banner.imageUrl}
            alt={banner.title}
            className="w-full h-full object-cover object-center filter brightness-[0.88]"
            referrerPolicy="no-referrer"
          />
          {/* Subtle gradient overlay to guarantee text legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent sm:bg-gradient-to-r sm:from-slate-950/90 sm:via-slate-950/50 sm:to-transparent" />
        </div>

        {/* Content Box */}
        <div className="relative z-10 max-w-xl p-6 sm:p-10 md:p-12 text-white">
          {banner.badgeText && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 backdrop-blur-md border border-amber-400/30 text-amber-300 text-xs font-semibold mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{banner.badgeText}</span>
            </div>
          )}

          <h1 className="font-heading text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-white leading-tight mb-2 sm:mb-3">
            {banner.title}
          </h1>

          <p className="text-sm sm:text-base text-slate-200/90 mb-5 max-w-md leading-relaxed">
            {banner.subtitle}
          </p>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCta}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-lg shadow-amber-900/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <span>{banner.ctaText}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setSelectedCategory('cat-hair');
                setActiveTab('shop');
              }}
              className="px-4 py-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white text-xs sm:text-sm font-medium rounded-xl border border-white/20 transition-colors"
            >
              Hairbrushes
            </button>
          </div>
        </div>
      </div>

      {/* Banner slider indicators if multiple */}
      {banners.length > 1 && (
        <div className="absolute bottom-3 right-6 z-20 flex gap-1.5">
          {banners.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={`h-1.5 rounded-full transition-all ${
                idx === currentIndex ? 'w-6 bg-amber-500' : 'w-2 bg-white/40'
              }`}
              aria-label={`Slide ${idx + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
};
