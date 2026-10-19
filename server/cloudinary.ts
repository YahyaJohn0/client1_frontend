import { v2 as cloudinary } from 'cloudinary';
import type { UploadApiResponse } from 'cloudinary';

// Configure using CLOUDINARY_URL from environment
if (process.env.CLOUDINARY_URL) {
  cloudinary.config({
    cloudinary_url: process.env.CLOUDINARY_URL
  });
}

export const CLOUDINARY_CONFIG = {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
  uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || '',
  assetFolder: 'samples/ecommerce'
};

export interface CloudinaryUploadResult {
  url: string;
  secureUrl: string;
  publicId: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
}

/**
 * Upload an image (base64 string or data URI or remote URL) to Cloudinary securely via backend
 */
export async function uploadToCloudinary(
  fileInput: string,
  folder: string = CLOUDINARY_CONFIG.assetFolder
): Promise<CloudinaryUploadResult> {
  if (!process.env.CLOUDINARY_URL) {
    throw new Error('Cloudinary is not configured. Missing CLOUDINARY_URL environment variable.');
  }

  // Ensure upload is scoped inside authorized project folder
  const safeFolder = folder.startsWith('samples/ecommerce') ? folder : `samples/ecommerce/${folder}`.replace(/\/+/g, '/');

  const result: UploadApiResponse = await cloudinary.uploader.upload(fileInput, {
    folder: safeFolder,
    resource_type: 'image',
    tags: ['zamzam', 'ecommerce', 'product'],
    transformation: [
      { quality: 'auto', fetch_format: 'auto' }
    ]
  });

  return {
    url: result.url,
    secureUrl: result.secure_url,
    publicId: result.public_id,
    format: result.format,
    width: result.width,
    height: result.height,
    bytes: result.bytes
  };
}

/**
 * Delete an image from Cloudinary using its public ID.
 * Security enforcement: public ID must belong to this application's asset folder to prevent accidental/malicious deletion.
 */
export async function deleteFromCloudinary(publicId: string): Promise<{ success: boolean; result: string }> {
  if (!publicId || typeof publicId !== 'string') {
    throw new Error('Invalid public ID for Cloudinary image deletion');
  }

  // Restrict deletions to assets within the project folder
  if (!publicId.startsWith('samples/ecommerce')) {
    console.warn(`[Security Warning] Attempted deletion of non-ecommerce asset: ${publicId}`);
    throw new Error('Access denied: You can only delete assets within the samples/ecommerce folder.');
  }

  const res = await cloudinary.uploader.destroy(publicId, {
    resource_type: 'image',
    invalidate: true
  });

  return {
    success: res.result === 'ok' || res.result === 'not found',
    result: res.result
  };
}

/**
 * Health check for Cloudinary connectivity
 */
export async function testCloudinaryConnection(): Promise<{ connected: boolean; message: string }> {
  try {
    if (!process.env.CLOUDINARY_URL) {
      return { connected: false, message: 'CLOUDINARY_URL is missing' };
    }
    const ping = await cloudinary.api.ping();
    return { connected: ping.status === 'ok', message: 'Cloudinary connected successfully' };
  } catch (err: any) {
    return { connected: false, message: err.message || 'Failed to ping Cloudinary' };
  }
}
