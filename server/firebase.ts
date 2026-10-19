import { initializeApp, getApps, getApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { DatabaseSchema, Product, Category, Order } from './db.ts';

let firebaseApp: FirebaseApp | null = null;
let firestoreDb: Firestore | null = null;

/**
 * The bundled Express server keeps the authoritative store in data/store.json.
 * Mirroring writes into Firestore is opt-in because it needs the browser
 * Firebase client SDK to be authorized for server-side writes.
 */
const FIRESTORE_SYNC_ENABLED = process.env.ENABLE_FIRESTORE_SYNC === 'true';

export const FIREBASE_CONFIG = {
  apiKey: process.env.FIREBASE_API_KEY || '',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
  databaseURL: process.env.FIREBASE_DATABASE_URL || '',
  projectId: process.env.FIREBASE_PROJECT_ID || '',
  appId: process.env.FIREBASE_APP_ID || ''
};

export function initFirebase(): { app: FirebaseApp | null; db: Firestore | null } {
  if (!FIRESTORE_SYNC_ENABLED) return { app: null, db: null };

  if (!FIREBASE_CONFIG.apiKey || !FIREBASE_CONFIG.projectId) {
    console.warn('[Firebase] Incomplete Firebase configuration in environment variables.');
    return { app: null, db: null };
  }

  try {
    if (!firebaseApp) {
      if (getApps().length > 0) {
        firebaseApp = getApp();
      } else {
        firebaseApp = initializeApp(FIREBASE_CONFIG);
      }
    }
    if (!firestoreDb && firebaseApp) {
      firestoreDb = getFirestore(firebaseApp);
    }
    return { app: firebaseApp, db: firestoreDb };
  } catch (err: any) {
    console.warn('[Firebase Init Warning]', err.message);
    return { app: null, db: null };
  }
}

export interface FirebaseStatus {
  configured: boolean;
  connected: boolean;
  projectId: string;
  databaseAvailable: boolean;
  message: string;
  collectionCounts?: {
    products: number;
    categories: number;
    orders: number;
  };
}

/**
 * Checks connectivity to Firestore database
 */
export async function checkFirestoreStatus(): Promise<FirebaseStatus> {
  if (!FIRESTORE_SYNC_ENABLED) {
    return {
      configured: false,
      connected: false,
      projectId: FIREBASE_CONFIG.projectId,
      databaseAvailable: false,
      message:
        'Firestore mirroring is disabled. The bundled server keeps data in data/store.json; set ENABLE_FIRESTORE_SYNC=true to mirror product writes.'
    };
  }

  if (!FIREBASE_CONFIG.apiKey || !FIREBASE_CONFIG.projectId) {
    return {
      configured: false,
      connected: false,
      projectId: FIREBASE_CONFIG.projectId,
      databaseAvailable: false,
      message: 'Firebase environment variables are incomplete'
    };
  }

  try {
    // Quick REST check to verify if the (default) Firestore database exists in this GCP project
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/products?key=${FIREBASE_CONFIG.apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data = await res.json().catch(() => ({}));

    if (res.status === 404 && data?.error?.message?.includes('database (default) does not exist')) {
      return {
        configured: true,
        connected: false,
        projectId: FIREBASE_CONFIG.projectId,
        databaseAvailable: false,
        message: 'Firebase project connected, but the Firestore database is not yet created. Visit Firebase Console -> Firestore Database -> "Create database".'
      };
    }

    if (!res.ok && res.status !== 200) {
      return {
        configured: true,
        connected: false,
        projectId: FIREBASE_CONFIG.projectId,
        databaseAvailable: false,
        message: data?.error?.message || `Firestore returned HTTP ${res.status}`
      };
    }

    // Database is reachable
    const count = data?.documents ? data.documents.length : 0;
    return {
      configured: true,
      connected: true,
      projectId: FIREBASE_CONFIG.projectId,
      databaseAvailable: true,
      message: 'Connected to Cloud Firestore',
      collectionCounts: {
        products: count,
        categories: 0,
        orders: 0
      }
    };
  } catch (err: any) {
    return {
      configured: true,
      connected: false,
      projectId: FIREBASE_CONFIG.projectId,
      databaseAvailable: false,
      message: err.message || 'Could not connect to Firebase Firestore'
    };
  }
}

/**
 * Saves or updates a product in Firestore if database is available
 */
export async function syncProductToFirestore(product: Product): Promise<boolean> {
  try {
    const { db } = initFirebase();
    if (!db) return false;

    const docRef = doc(db, 'products', product.id);
    await setDoc(docRef, {
      ...product,
      firestoreSyncedAt: new Date().toISOString()
    }, { merge: true });

    return true;
  } catch (err: any) {
    console.warn(`[Firestore Sync Warning] Failed to sync product ${product.id}:`, err.message);
    return false;
  }
}

/**
 * Deletes a product document from Firestore
 */
export async function deleteProductFromFirestore(productId: string): Promise<boolean> {
  try {
    const { db } = initFirebase();
    if (!db) return false;

    const docRef = doc(db, 'products', productId);
    await deleteDoc(docRef);
    return true;
  } catch (err: any) {
    console.warn(`[Firestore Delete Warning] Failed to delete product ${productId}:`, err.message);
    return false;
  }
}

/**
 * Migrate all store records to Firestore preserving all IDs and fields
 */
export async function migrateStoreToFirestore(data: DatabaseSchema): Promise<{
  success: boolean;
  migrated: {
    products: number;
    categories: number;
    orders: number;
    coupons: number;
    banners: number;
  };
  errors: string[];
}> {
  const result = {
    success: true,
    migrated: { products: 0, categories: 0, orders: 0, coupons: 0, banners: 0 },
    errors: [] as string[]
  };

  const { db } = initFirebase();
  if (!db) {
    result.success = false;
    result.errors.push('Firebase is not initialized or database is unavailable');
    return result;
  }

  // 1. Products
  for (const p of data.products) {
    try {
      await setDoc(doc(db, 'products', p.id), p, { merge: true });
      result.migrated.products++;
    } catch (e: any) {
      result.errors.push(`Product ${p.id}: ${e.message}`);
    }
  }

  // 2. Categories
  for (const c of data.categories) {
    try {
      await setDoc(doc(db, 'categories', c.id), c, { merge: true });
      result.migrated.categories++;
    } catch (e: any) {
      result.errors.push(`Category ${c.id}: ${e.message}`);
    }
  }

  // 3. Orders
  for (const o of data.orders) {
    try {
      await setDoc(doc(db, 'orders', o.id), o, { merge: true });
      result.migrated.orders++;
    } catch (e: any) {
      result.errors.push(`Order ${o.id}: ${e.message}`);
    }
  }

  // 4. Coupons
  for (const cp of data.coupons) {
    try {
      await setDoc(doc(db, 'coupons', cp.id), cp, { merge: true });
      result.migrated.coupons++;
    } catch (e: any) {
      result.errors.push(`Coupon ${cp.id}: ${e.message}`);
    }
  }

  // 5. Banners
  for (const b of data.banners) {
    try {
      await setDoc(doc(db, 'banners', b.id), b, { merge: true });
      result.migrated.banners++;
    } catch (e: any) {
      result.errors.push(`Banner ${b.id}: ${e.message}`);
    }
  }

  // 6. Settings
  try {
    await setDoc(doc(db, 'settings', 'store_config'), data.settings, { merge: true });
  } catch (e: any) {
    result.errors.push(`Settings: ${e.message}`);
  }

  result.success = result.errors.length === 0;
  return result;
}
