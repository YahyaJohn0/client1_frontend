import React, { useState, useRef } from 'react';
import { Upload, X, Star, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { api } from '../../services/api.ts';

export interface UploadedImageItem {
  id: string;
  url: string;
  publicId?: string;
  altText?: string;
  isPrimary?: boolean;
  file?: File;
  previewUrl?: string;
  status: 'ready' | 'uploading' | 'error';
  errorMessage?: string;
  progress?: number;
}

interface CloudinaryImageUploaderProps {
  images: UploadedImageItem[];
  onChange: (images: UploadedImageItem[]) => void;
  onDeletedPublicId?: (publicId: string) => void;
  maxFiles?: number;
  maxSizeMB?: number;
}

const MAX_IMAGE_SIZE_MB = 5;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

export const CloudinaryImageUploader: React.FC<CloudinaryImageUploaderProps> = ({
  images,
  onChange,
  onDeletedPublicId,
  maxFiles = 8,
  maxSizeMB = MAX_IMAGE_SIZE_MB
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  /**
   * Uploads a single image through the authenticated API, which streams it to
   * Cloudinary using server-side credentials.
   */
  const uploadSingleImage = async (item: UploadedImageItem): Promise<UploadedImageItem> => {
    if (!item.file) return item;

    try {
      const uploaded = await api.uploadProductImage(item.file);

      return {
        ...item,
        url: uploaded.secureUrl || uploaded.url,
        publicId: uploaded.publicId || undefined,
        status: 'ready',
        errorMessage: undefined,
        file: undefined
      };
    } catch (err: any) {
      console.error('[Image Upload Error]', err);
      return {
        ...item,
        status: 'error',
        errorMessage: err.message || 'Failed to upload image'
      };
    }
  };

  const handleFiles = async (files: FileList | File[]) => {
    setGeneralError(null);
    const fileArray = Array.from(files);

    if (images.length + fileArray.length > maxFiles) {
      setGeneralError(`Maximum of ${maxFiles} images permitted per product.`);
      return;
    }

    const newItems: UploadedImageItem[] = [];

    for (const file of fileArray) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setGeneralError(`"${file.name}" is not a supported format. Please use JPG, PNG, WEBP, or AVIF.`);
        return;
      }

      if (file.size > maxSizeMB * 1024 * 1024) {
        setGeneralError(`"${file.name}" exceeds the ${maxSizeMB}MB file size limit.`);
        return;
      }

      const tempId = `img-temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const previewUrl = URL.createObjectURL(file);

      newItems.push({
        id: tempId,
        url: previewUrl,
        previewUrl,
        file,
        status: 'uploading',
        isPrimary: images.length === 0 && newItems.length === 0
      });
    }

    if (newItems.length === 0) return;

    // Immediately show previews with spinner
    const initialList = [...images, ...newItems];
    onChange(initialList);

    // Upload directly to Cloudinary after checking the signed-in Firebase admin.
    const finalItems = await Promise.all(
      initialList.map(async (img) => {
        if (img.status === 'uploading' && img.file) {
          return await uploadSingleImage(img);
        }
        return img;
      })
    );

    onChange(finalItems);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleRemove = (item: UploadedImageItem) => {
    if (item.publicId && onDeletedPublicId) {
      onDeletedPublicId(item.publicId);
    }

    const filtered = images.filter(img => img.id !== item.id);
    if (item.isPrimary && filtered.length > 0) {
      filtered[0].isPrimary = true;
    }
    onChange(filtered);
  };

  const handleSetPrimary = (id: string) => {
    const updated = images.map(img => ({
      ...img,
      isPrimary: img.id === id
    }));
    onChange(updated);
  };

  const handleRetry = async (item: UploadedImageItem) => {
    const updated = images.map(img => img.id === item.id ? { ...img, status: 'uploading' as const } : img);
    onChange(updated);

    const retried = await uploadSingleImage(item);
    onChange(images.map(img => img.id === item.id ? retried : img));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <label className="block text-xs font-semibold text-slate-800">
            Product Images (Cloudinary)
          </label>
          <p className="text-[11px] text-slate-500">
            Uploaded directly to Cloudinary. First or starred photo serves as the cover image.
          </p>
        </div>
        <span className="text-[11px] font-medium text-slate-400">
          {images.length} / {maxFiles} images
        </span>
      </div>

      {generalError && (
        <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
          <span>{generalError}</span>
        </div>
      )}

      {/* Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-amber-600 bg-amber-50/60 scale-[0.99]'
            : 'border-slate-200 hover:border-amber-500 hover:bg-slate-50/50 bg-white'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES.join(',')}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = '';
          }}
        />

        <div className="flex flex-col items-center justify-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
            <Upload className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-800">
              Click to browse or drag and drop product photos here
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              JPG, PNG, WEBP, or AVIF (Up to {maxSizeMB}MB each) &bull; Direct Cloudinary upload
            </p>
          </div>
        </div>
      </div>

      {/* Image Gallery Grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          {images.map((item, idx) => (
            <div
              key={item.id}
              className={`relative group rounded-xl border overflow-hidden bg-slate-50 transition-all ${
                item.isPrimary ? 'ring-2 ring-amber-600 border-amber-600 shadow-xs' : 'border-slate-200'
              }`}
            >
              {/* Image Preview */}
              <div className="aspect-square w-full relative overflow-hidden bg-slate-100 flex items-center justify-center">
                <img
                  src={item.url}
                  alt={item.altText || `Product image ${idx + 1}`}
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                  className="w-full h-full object-cover"
                />

                {/* Uploading Overlay */}
                {item.status === 'uploading' && (
                  <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs flex flex-col items-center justify-center text-white gap-1.5 p-2 text-center">
                    <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
                    <span className="text-[10px] font-medium">Uploading to Cloudinary...</span>
                  </div>
                )}

                {/* Error Overlay */}
                {item.status === 'error' && (
                  <div className="absolute inset-0 bg-rose-950/85 backdrop-blur-xs flex flex-col items-center justify-center text-white gap-1.5 p-2 text-center">
                    <AlertCircle className="w-5 h-5 text-rose-400" />
                    <span className="text-[10px] text-rose-200 line-clamp-2 px-1">{item.errorMessage || 'Upload failed'}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRetry(item);
                      }}
                      className="mt-1 px-2 py-0.5 bg-white text-rose-900 font-semibold text-[10px] rounded-md flex items-center gap-1 hover:bg-slate-100 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" /> Retry
                    </button>
                  </div>
                )}
              </div>

              {/* Action Bar / Badges */}
              <div className="p-2 bg-white flex items-center justify-between gap-1 text-[11px] border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleSetPrimary(item.id)}
                  title={item.isPrimary ? 'Primary Cover Photo' : 'Make Primary Cover'}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors cursor-pointer ${
                    item.isPrimary
                      ? 'bg-amber-100 text-amber-900 font-bold'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  <Star className={`w-3 h-3 ${item.isPrimary ? 'fill-amber-600 text-amber-600' : 'text-slate-400'}`} />
                  <span>{item.isPrimary ? 'Primary' : 'Cover'}</span>
                </button>

                <div className="flex items-center gap-1">
                  {item.publicId && (
                    <span className="text-[9px] font-mono text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded" title={`Cloudinary ID: ${item.publicId}`}>
                      Cloud
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemove(item)}
                    className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    title="Remove image"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
