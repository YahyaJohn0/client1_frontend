import React from 'react';
import { Phone, Mail, MapPin, Truck, RefreshCw, HelpCircle } from 'lucide-react';
import { useStore } from '../context/StoreContext.tsx';

export const HelpView: React.FC = () => {
  const { settings } = useStore();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-20 space-y-6">
      <div className="text-center max-w-md mx-auto">
        <h1 className="font-heading text-2xl font-bold text-slate-900 tracking-tight mb-1">
          Customer Care & Help
        </h1>
        <p className="text-xs sm:text-sm text-slate-500">
          Everything you need to know about shopping, shipping, and returns.
        </p>
      </div>

      {/* Contact Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-2xs text-center flex flex-col items-center">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center mb-2">
            <Phone className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Phone & WhatsApp</span>
          <p className="text-xs font-bold text-slate-900 mt-1">{settings?.contactPhone}</p>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-2xs text-center flex flex-col items-center">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center mb-2">
            <Mail className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Email Support</span>
          <p className="text-xs font-bold text-slate-900 mt-1">{settings?.contactEmail}</p>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-2xs text-center flex flex-col items-center">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center mb-2">
            <MapPin className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Store Studio</span>
          <p className="text-xs font-bold text-slate-900 mt-1">Lahore, Pakistan</p>
        </div>
      </div>

      {/* Policies */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-5">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700 shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-heading text-sm font-bold text-slate-900 mb-1">
              Nationwide Delivery Policy
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {settings?.deliveryPolicy}
            </p>
            <div className="mt-2 text-xs text-amber-800 font-semibold bg-amber-50/70 px-3 py-1.5 rounded-lg inline-block">
              Standard COD Fee: Rs. {settings?.standardShippingFee} · Free above Rs. {settings?.freeShippingThreshold?.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-5 flex items-start gap-3.5">
          <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700 shrink-0">
            <RefreshCw className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-heading text-sm font-bold text-slate-900 mb-1">
              7-Day Return & Exchange
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {settings?.returnPolicy}
            </p>
          </div>
        </div>
      </div>

      {/* Frequently Asked Questions */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-3.5">
        <h3 className="font-heading text-sm font-bold text-slate-900 flex items-center gap-1.5 mb-2">
          <HelpCircle className="w-4 h-4 text-amber-600" />
          <span>Frequently Asked Questions</span>
        </h3>

        <div className="space-y-3 text-xs divide-y divide-slate-100">
          <div className="pt-2 first:pt-0">
            <p className="font-bold text-slate-800">Do I need an account to place an order?</p>
            <p className="text-slate-600 mt-0.5">No! You can order seamlessly with guest checkout using just your name, phone number, and delivery address.</p>
          </div>
          <div className="pt-2">
            <p className="font-bold text-slate-800">How do I pay?</p>
            <p className="text-slate-600 mt-0.5">We accept Cash on Delivery (COD) across Pakistan. You pay the delivery rider when your parcel arrives.</p>
          </div>
          <div className="pt-2">
            <p className="font-bold text-slate-800">How do I track my order?</p>
            <p className="text-slate-600 mt-0.5">Go to the "Track" tab, enter your Order Number (e.g. #ORD-XXXX) and phone number to see the live timeline.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
