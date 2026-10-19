import React from 'react';
import { useStore } from '../context/StoreContext.tsx';
import { Sparkles, Layers, Scissors, Box, Home } from 'lucide-react';

export const CategoryScroller: React.FC = () => {
  const { categories, selectedCategory, setSelectedCategory, setActiveTab } = useStore();

  const getCategoryIcon = (slug: string) => {
    switch (slug) {
      case 'hairbrushes-styling':
        return <Scissors className="w-4 h-4" />;
      case 'cosmetic-organizers':
        return <Box className="w-4 h-4" />;
      case 'beauty-tools':
        return <Sparkles className="w-4 h-4" />;
      case 'household-storage':
        return <Home className="w-4 h-4" />;
      default:
        return <Layers className="w-4 h-4" />;
    }
  };

  const handleSelect = (catId: string) => {
    setSelectedCategory(catId);
    setActiveTab('shop');
  };

  return (
    <section className="px-4 sm:px-6 my-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading text-lg font-bold text-slate-900 tracking-tight">
          Shop By Category
        </h2>
        <button
          onClick={() => {
            setSelectedCategory('all');
            setActiveTab('shop');
          }}
          className="text-xs font-semibold text-amber-700 hover:text-amber-800 transition-colors"
        >
          View All
        </button>
      </div>

      {/* Horizontal Scroll Bar */}
      <div className="flex items-center gap-2.5 overflow-x-auto pb-2 scrollbar-none no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
        <button
          onClick={() => handleSelect('all')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-all ${
            selectedCategory === 'all'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-700 border border-slate-200/80 hover:bg-slate-50'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>All Items</span>
        </button>

        {categories.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => handleSelect(cat.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-all ${
                isSelected
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-slate-700 border border-slate-200/80 hover:bg-slate-50'
              }`}
            >
              {getCategoryIcon(cat.slug)}
              <span>{cat.name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
