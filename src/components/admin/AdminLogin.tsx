import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Mail,
  ArrowRight,
  AlertCircle,
  Info,
  Eye,
  EyeOff,
  Copy,
  Check,
  ShieldAlert
} from 'lucide-react';
import { adminSignIn, adminSignOut } from '../../services/firebase.ts';
import { api, ApiError, type AdminIdentity } from '../../services/api.ts';

interface AdminLoginProps {
  onLoginSuccess: (identity: AdminIdentity) => void;
  onExit: () => void;
  initialError?: string;
  initialUid?: string;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({
  onLoginSuccess,
  onExit,
  initialError,
  initialUid
}) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(initialError || '');
  const [deniedUid, setDeniedUid] = useState<string | undefined>(initialUid);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = identifier.trim();
    if (!cleanId || !password || !cleanId.includes('@')) {
      setError('Enter your administrator Firebase email and password.');
      return;
    }

    setIsLoading(true);
    setError('');
    setDeniedUid(undefined);

    try {
      if (cleanId.includes('@')) {
        // Firebase Authentication establishes the identity; the Firestore
        // administrator allowlist controls access to protected data.
        try {
          await adminSignIn(cleanId, password);
        } catch (fbErr: any) {
          throw fbErr;
        }

        try {
          const identity = await api.adminMe();
          onLoginSuccess(identity);
          return;
        } catch (authErr: any) {
          // The Firebase login succeeded, but this account is not an
          // administrator. Never fall back to a local password for an email.
          await adminSignOut().catch(() => undefined);
          if (authErr instanceof ApiError && authErr.status === 403) {
            setDeniedUid(authErr.details?.uid);
            throw new Error(
              authErr.message || 'This account is not authorized as an administrator.'
            );
          }
          throw authErr;
        }
      }

    } catch (err: any) {
      console.error('[Admin Login Error]', err?.code || err?.message);
      let message = err?.message || 'Authentication failed. Please verify your credentials.';

      if (
        err?.code === 'auth/invalid-credential' ||
        err?.code === 'auth/wrong-password' ||
        err?.code === 'auth/user-not-found'
      ) {
        message = 'Invalid administrator credentials.';
      } else if (err?.code === 'auth/too-many-requests') {
        message = 'Access temporarily disabled due to multiple failed attempts. Please try again later.';
      } else if (err?.code === 'auth/network-request-failed') {
        message = 'Network connection failed. Please check your internet connection.';
      } else if (err instanceof ApiError) {
        if (err.status === 401) message = 'Invalid administrator credentials.';
        else if (err.status === 423) message = err.message;
        else if (err.status === 429) message = err.message;
        else if (err.status === 0) message = err.message;
      }

      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const copyUid = async () => {
    if (!deniedUid) return;
    try {
      await navigator.clipboard.writeText(deniedUid);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const firebaseProjectId = import.meta.env.FIREBASE_PROJECT_ID || '';

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200/80 shadow-2xl p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-slate-900 text-amber-400 mx-auto flex items-center justify-center mb-3 shadow-md">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 className="font-heading text-2xl font-bold text-slate-900">
            Admin Access Portal
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Sign in with your Firebase administrator email account.
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {deniedUid && (
          <div className="mb-5 p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-[11px] text-amber-900">
            <div className="flex items-center gap-1.5 font-semibold">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              <span>Account not authorized as administrator</span>
            </div>
            <p className="leading-snug">
              This Firebase account is valid, but it is not on the server-side administrator
              allowlist. A trusted operator must add its UID to <code className="bg-amber-100 px-1 rounded">ADMIN_UIDS</code> and
              restart the API.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-white/70 border border-amber-200 rounded-lg px-2 py-1.5 font-mono text-[10px] break-all">
                {deniedUid}
              </code>
              <button
                type="button"
                onClick={copyUid}
                className="px-2 py-1.5 bg-amber-100 hover:bg-amber-200 rounded-lg font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <button
              type="button"
              onClick={async () => {
                await adminSignOut().catch(() => undefined);
                setDeniedUid(undefined);
                setError('');
              }}
              className="text-[10px] font-semibold text-amber-800 underline underline-offset-2 hover:text-amber-950 cursor-pointer"
            >
              Sign out of this Firebase account
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Administrator Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                autoComplete="username"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-9 pr-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Administrator Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-9 pr-10 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>{isLoading ? 'Verifying Administrator Session...' : 'Sign In as Administrator'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-5 p-3.5 bg-slate-50 border border-slate-200/70 rounded-xl space-y-1.5 text-[11px] text-slate-600">
          <div className="flex items-center gap-1.5 font-semibold text-slate-800">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            <span>Server-controlled access</span>
          </div>
          <p className="leading-snug">
            A valid Firebase login is not administrator access. Every admin request is verified by
            the API against the server-side administrator allowlist or a server-issued custom claim.
            Customer accounts cannot access this console.
          </p>
        </div>

        <div className="mt-4 p-2.5 bg-slate-50 border border-slate-100 rounded-xl flex items-center gap-2 text-[11px] text-slate-500">
          <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="truncate">
            {firebaseProjectId ? (
              <>Firebase Project: <span className="font-mono font-semibold text-slate-700">{firebaseProjectId}</span></>
            ) : (
              'Firebase project is not configured.'
            )}
          </span>
        </div>

        <div className="mt-5 pt-4 border-t border-slate-100 text-center">
          <button
            type="button"
            onClick={onExit}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
          >
            ← Return to Customer Storefront
          </button>
        </div>
      </div>
    </div>
  );
};
