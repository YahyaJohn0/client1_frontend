import React, { useState } from 'react';
import { ArrowRight, Sparkles, ShieldCheck, Truck, RefreshCw, Star, Heart, Mail } from 'lucide-react';
import { useStore } from '../context/StoreContext.tsx';
import { HeroBanner } from './HeroBanner.tsx';
import { CategoryScroller } from './CategoryScroller.tsx';
import { ProductCard } from './ProductCard.tsx';

export const HomeView: React.FC = () => {
  const { products, catalogError, refreshProducts, setActiveTab, setSelectedCategory, settings } = useStore();
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');

  const featuredProducts = products.filter(p => p.isFeatured).slice(0, 4);
  const bestSellers = products.filter(p => p.isBestSeller).slice(0, 4);
  const newArrivals = products.filter(p => p.isNewArrival).slice(0, 4);

  const handleEmailSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const recipient = settings?.contactEmail || 'ahsanullahyousafzai90@gmail.com';
    const subject = 'Website inquiry - Zamzam Trade & Company';
    const body = `${contactMessage.trim()}\n\nReply to: ${contactEmail.trim()}`;
    const gmailUrl = new URL('https://mail.google.com/mail/');
    gmailUrl.searchParams.set('view', 'cm');
    gmailUrl.searchParams.set('fs', '1');
    gmailUrl.searchParams.set('to', recipient);
    gmailUrl.searchParams.set('su', subject);
    gmailUrl.searchParams.set('body', body);
    window.open(gmailUrl.toString(), '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="pb-24 space-y-8">
      {/* Dynamic Hero Promotional Banner */}
      <HeroBanner />

      {/* Categories Horizontal Carousel */}
      <CategoryScroller />

      {catalogError && (
        <section role="alert" className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="p-4 border border-rose-200 bg-rose-50 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-rose-900">Products could not be loaded</h2>
              <p className="text-xs text-rose-800 mt-1">{catalogError}</p>
            </div>
            <button
              onClick={() => void refreshProducts()}
              className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl inline-flex items-center justify-center gap-2 shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        </section>
      )}

      {/* Featured Curations Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-heading text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              Featured Curations
            </h2>
            <p className="text-xs text-slate-500">
              Handcrafted brushes, detanglers & premium vanity caddies
            </p>
          </div>
          <button
            onClick={() => {
              setSelectedCategory('all');
              setActiveTab('shop');
            }}
            className="text-xs font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1 transition-colors"
          >
            <span>See All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
          {featuredProducts.map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      {/* Value Proposition Strip */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="bg-slate-900 text-white rounded-2xl p-6 sm:p-8 grid grid-cols-1 sm:grid-cols-3 gap-6 shadow-sm">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-heading text-sm font-bold text-white mb-0.5">Nationwide COD</h3>
              <p className="text-xs text-slate-300">
                Pay in cash when rider delivers to your doorstep. Free delivery above Rs. {settings?.freeShippingThreshold?.toLocaleString() || '3,000'}.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-heading text-sm font-bold text-white mb-0.5">7-Day Easy Returns</h3>
              <p className="text-xs text-slate-300">
                Hassle-free replacement guarantee on personal beauty & storage accessories.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-heading text-sm font-bold text-white mb-0.5">100% Quality Checked</h3>
              <p className="text-xs text-slate-300">
                Every bristle, grip, and organizer acrylic drawer is rigorously inspected before dispatch.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Best Sellers Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-heading text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              Best Sellers
            </h2>
            <p className="text-xs text-slate-500">
              Most loved by our community across Pakistan
            </p>
          </div>
          <button
            onClick={() => {
              setSelectedCategory('all');
              setActiveTab('shop');
            }}
            className="text-xs font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1 transition-colors"
          >
            <span>See All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
          {bestSellers.map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      {/* New Arrivals Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-heading text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              New Arrivals
            </h2>
            <p className="text-xs text-slate-500">
              Fresh additions to elevate your everyday routines
            </p>
          </div>
          <button
            onClick={() => {
              setSelectedCategory('all');
              setActiveTab('shop');
            }}
            className="text-xs font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1 transition-colors"
          >
            <span>See All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
          {newArrivals.map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      {/* Store Footer */}
      <footer className="border-t border-slate-200/80 bg-white pt-10 pb-16 px-4 sm:px-6 mt-12">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-600 text-white flex items-center justify-center font-bold text-sm">
                Z
              </div>
              <span className="font-heading text-lg font-bold text-slate-900">
                {settings?.storeName || 'Zamzam'}
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              {settings?.aboutText || 'Zamzam curates salon-grade hair care brushes, high-precision personal grooming tools, and elegant cosmetic storage designed for modern everyday living.'}
            </p>
            <p className="text-xs text-slate-600 font-medium">
              Lahore, Pakistan · Nationwide Delivery
            </p>
          </div>

          <div>
            <h4 className="font-heading text-xs font-bold uppercase tracking-wider text-slate-900 mb-3">
              Shop Collections
            </h4>
            <ul className="space-y-2 text-xs text-slate-600">
              <li>
                <button onClick={() => { setSelectedCategory('cat-hair'); setActiveTab('shop'); }} className="hover:text-slate-900">
                  Hairbrushes & Thermal Rollers
                </button>
              </li>
              <li>
                <button onClick={() => { setSelectedCategory('cat-organizers'); setActiveTab('shop'); }} className="hover:text-slate-900">
                  Cosmetic Vanity Organizers
                </button>
              </li>
              <li>
                <button onClick={() => { setSelectedCategory('cat-beauty'); setActiveTab('shop'); }} className="hover:text-slate-900">
                  French Hair Claw Clips
                </button>
              </li>
              <li>
                <button onClick={() => { setSelectedCategory('cat-household'); setActiveTab('shop'); }} className="hover:text-slate-900">
                  Household Storage Solutions
                </button>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-heading text-xs font-bold uppercase tracking-wider text-slate-900 mb-3">
              Customer Services
            </h4>
            <ul className="space-y-2 text-xs text-slate-600">
              <li>
                <button onClick={() => setActiveTab('track')} className="hover:text-slate-900">
                  Guest Order Tracking
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab('wishlist')} className="hover:text-slate-900">
                  My Wishlist
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab('track')} className="hover:text-slate-900">
                  Shipping & Return Policy
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab('shop')} className="hover:text-slate-900">
                  All Collections
                </button>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-heading text-xs font-bold uppercase tracking-wider text-slate-900 mb-3">
              Direct Inquiries
            </h4>
            <div className="space-y-1.5 text-xs text-slate-600">
              <p>WhatsApp / Call: <strong className="text-slate-900">{settings?.contactPhone || '03049002888'}</strong></p>
              <form onSubmit={handleEmailSubmit} className="pt-2 space-y-2">
                <label htmlFor="footer-contact-email" className="block font-medium text-slate-700">
                  Email us
                </label>
                <input
                  id="footer-contact-email"
                  type="email"
                  required
                  value={contactEmail}
                  onChange={event => setContactEmail(event.target.value)}
                  placeholder="Your email address"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
                <textarea
                  required
                  value={contactMessage}
                  onChange={event => setContactMessage(event.target.value)}
                  placeholder="How can we help?"
                  rows={2}
                  className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-700"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Open Gmail to send
                </button>
              </form>
              <p className="pt-1 text-[11px] text-slate-400">Cash on Delivery Available Nationwide</p>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto border-t border-slate-100 mt-8 pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400">
          <p>© {new Date().getFullYear()} {settings?.storeName || 'Zamzam'}. All rights reserved.</p>
          <div className="flex items-center gap-4 mt-2 sm:mt-0">
            <span>Secure Guest Checkout</span>
            <span>·</span>
            <span>Zero Account Required</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
