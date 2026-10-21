import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  sendPasswordResetEmail,
  updateProfile,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  type Auth,
  type User
} from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getFirestore } from 'firebase/firestore';
import type { Product } from '../types/store.ts';
import { getMongoProducts } from './mongoProductsClient.ts';

const firebaseConfig = {
  apiKey: import.meta.env.FIREBASE_API_KEY || '',
  authDomain: import.meta.env.FIREBASE_AUTH_DOMAIN || '',
  databaseURL: import.meta.env.FIREBASE_DATABASE_URL || '',
  projectId: import.meta.env.FIREBASE_PROJECT_ID || '',
  appId: import.meta.env.FIREBASE_APP_ID || ''
};

/**
 * Customer and administrator sessions use two separate Firebase app instances.
 * Signing into the administrator console therefore never signs a customer out
 * (or in), and a customer session can never be mistaken for an admin session.
 */
const DEFAULT_APP_NAME = '[DEFAULT]';
const ADMIN_APP_NAME = 'zamzam-admin';

function existingApp(name: string) {
  return getApps().find(app => app.name === name) || null;
}

export const app = existingApp(DEFAULT_APP_NAME) || initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const firestore = getFirestore(app);
export const database = getDatabase(app);

export const adminApp = existingApp(ADMIN_APP_NAME) || initializeApp(firebaseConfig, ADMIN_APP_NAME);
export const adminAuth = getAuth(adminApp);

export async function getPublishedProducts(): Promise<Product[]> {
  return getMongoProducts();
}

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

async function getIdTokenFor(authInstance: Auth, forceRefresh = false): Promise<string | null> {
  const user = authInstance.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken(forceRefresh);
  } catch (err) {
    console.warn('[Firebase Auth] Failed to retrieve fresh ID token:', err);
    return null;
  }
}

/**
 * Retrieves a fresh Firebase ID token for the signed-in customer.
 */
export async function getFreshIdToken(forceRefresh = false): Promise<string | null> {
  return getIdTokenFor(auth, forceRefresh);
}

/**
 * Retrieves a fresh Firebase ID token for the signed-in administrator.
 * The server decides whether that identity is actually an administrator.
 */
export async function getAdminIdToken(forceRefresh = false): Promise<string | null> {
  return getIdTokenFor(adminAuth, forceRefresh);
}

export function getAdminCurrentUser(): User | null {
  return adminAuth.currentUser;
}

// ==========================================
// CUSTOMER AUTHENTICATION (EMAIL/PASSWORD & GOOGLE)
// ==========================================

/**
 * Customer sign-up with Email, Password and optional Full Name
 */
export async function customerSignUpWithEmail(email: string, pass: string, fullName?: string): Promise<User> {
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), pass);
  if (fullName && fullName.trim() && credential.user) {
    try {
      await updateProfile(credential.user, { displayName: fullName.trim() });
    } catch (e) {
      console.warn('Failed to update customer displayName:', e);
    }
  }
  return credential.user;
}

/**
 * Customer sign-in with Email and Password
 */
export async function customerSignInWithEmail(email: string, pass: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), pass);
  return credential.user;
}

/**
 * Customer sign-in with Google OAuth popup (with redirect fallback)
 */
export async function customerSignInWithGoogle(): Promise<User> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err: any) {
    // If popup was blocked by browser or failed, fallback to redirect flow
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
      try {
        await signInWithRedirect(auth, googleProvider);
        const redirectRes = await getRedirectResult(auth);
        if (redirectRes?.user) return redirectRes.user;
      } catch (redirectErr) {
        throw redirectErr;
      }
    }
    throw err;
  }
}

/**
 * Customer password reset via email
 */
export async function customerSendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

/**
 * Customer sign-out
 */
export async function customerSignOut(): Promise<void> {
  await signOut(auth);
}

// ==========================================
// ADMINISTRATOR AUTHENTICATION (separate Firebase app)
// ==========================================

/**
 * Signs an administrator into the dedicated admin Firebase app using
 * Email/Password. This proves authentication only; the backend separately
 * authorizes the account on every admin request.
 */
export async function adminSignIn(email: string, pass: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(adminAuth, email.trim(), pass);
  return credential.user;
}

/**
 * Signs out the administrator Firebase session only. Customer state is kept.
 */
export async function adminSignOut(): Promise<void> {
  await signOut(adminAuth);
}

/**
 * Subscribes to administrator Firebase authentication state changes.
 */
export function onAdminAuthStateChanged(callback: (user: User | null) => void) {
  return onAuthStateChanged(adminAuth, callback);
}

/**
 * Re-authenticates the signed-in administrator with their current password.
 * Firebase requires a recent login before a password can be changed.
 */
export async function reauthenticateAdmin(currentPassword: string): Promise<User> {
  const user = adminAuth.currentUser;
  if (!user || !user.email) {
    throw new Error('No administrator account is currently signed in.');
  }
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  return user;
}

/**
 * Updates the administrator password in Firebase. Must follow a successful
 * re-authentication. The password is never sent to the Zamzam API server.
 */
export async function updateAdminPassword(newPassword: string): Promise<void> {
  const user = adminAuth.currentUser;
  if (!user) {
    throw new Error('No administrator account is currently signed in.');
  }
  await updatePassword(user, newPassword);
}
