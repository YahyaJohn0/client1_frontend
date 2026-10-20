import React, { useState } from 'react';
import { AlertTriangle, Archive, Trash2, X, Loader2 } from 'lucide-react';
import { api } from '../../services/api.ts';
import type { Product } from '../../types/store.ts';

interface ProductDeleteModalProps {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export const ProductDeleteModal: React.FC<ProductDeleteModalProps> = ({
  product,
  isOpen,
  onClose,
  onSuccess
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmNameInput, setConfirmNameInput] = useState('');

  if (!isOpen) return null;

  const handleArchive = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      await api.archiveDemoProduct(product.id);
      onSuccess(`"${product.name}" has been successfully archived and deactivated from the storefront.`);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to archive product');
    } finally {
      setIsProcessing(false);
    }
  };

  const isNameConfirmed = confirmNameInput.trim().toLowerCase() === product.name.trim().toLowerCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Archive Product
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                SKU: {product.sku}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
              {errorMessage}
            </div>
          )}

          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-2">
            <p className="font-semibold flex items-center gap-1.5">
              <Archive className="w-4 h-4 text-amber-700 shrink-0" />
              Product Archival (Firebase Realtime Database)
            </p>
            <p className="text-[11px] leading-relaxed text-amber-800">
              Archiving <strong>&ldquo;{product.name}&rdquo;</strong> deactivates it from the active storefront catalog while preserving existing customer orders, packing slips, and historical reports intact.
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Type product name <span className="font-semibold text-slate-900">&ldquo;{product.name}&rdquo;</span> to confirm:
            </label>
            <input
              type="text"
              placeholder={product.name}
              value={confirmNameInput}
              onChange={(e) => setConfirmNameInput(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isProcessing || !isNameConfirmed}
              onClick={handleArchive}
              className="flex-1 py-2.5 px-4 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
              <span>Archive Product</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
