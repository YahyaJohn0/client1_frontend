import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyRound,
  ShieldCheck,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Clock,
  LogOut,
  Copy,
  Check,
  RefreshCw,
  History,
  ShieldAlert
} from 'lucide-react';
import {
  api,
  ApiError,
  type AdminIdentity
} from '../../services/api.ts';
import { reauthenticateAdmin, updateAdminPassword } from '../../services/firebase.ts';
import { validatePasswordStrength } from '../../utils/passwordPolicy.ts';
import type { AuditLog } from '../../types/store.ts';

interface AdminSecurityProps {
  admin: AdminIdentity;
  /** True while the account must rotate its password before using the console. */
  forced?: boolean;
  onChanged: () => Promise<unknown> | void;
  onSignOut: () => Promise<unknown> | void;
}

function describeFirebasePasswordError(err: any): string {
  const code = String(err?.code || '');
  if (code.includes('wrong-password') || code.includes('invalid-credential')) {
    return 'Current password is incorrect.';
  }
  if (code.includes('weak-password')) {
    return 'The identity provider rejected this password as too weak. Choose a longer, unique password.';
  }
  if (code.includes('requires-recent-login')) {
    return 'This change requires a recent sign-in. Please re-authenticate and try again.';
  }
  if (code.includes('too-many-requests')) {
    return 'Too many attempts. Please try again later.';
  }
  if (code.includes('network-request-failed')) {
    return 'Network connection failed. Please check your connection and retry.';
  }
  if (code.includes('user-token-expired') || code.includes('invalid-user-token')) {
    return 'Your administrator session has expired. Please sign in again.';
  }
  return err?.message || 'The password could not be changed.';
}

export const AdminSecurity: React.FC<AdminSecurityProps> = ({
  admin,
  forced = false,
  onChanged,
  onSignOut
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState(false);

  const [events, setEvents] = useState<AuditLog[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);

  const policy = useMemo(
    () =>
      validatePasswordStrength(newPassword, {
        currentPassword,
        identifier: admin.email || admin.username || admin.identifier
      }),
    [newPassword, currentPassword, admin.email, admin.username, admin.identifier]
  );

  const passwordsMatch = newPassword.length === 0 || confirmPassword.length === 0 || newPassword === confirmPassword;

  const loadEvents = useCallback(async () => {
    setIsLoadingEvents(true);
    try {
      const res = await api.adminGetAuditLogs();
      setEvents(res.auditLogs.filter(entry => entry.entityType === 'security').slice(0, 10));
    } catch {
      // Audit display is non-critical; keep the security form usable.
      setEvents([]);
    } finally {
      setIsLoadingEvents(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents, success]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    setError('');
    setSuccess('');

    if (!currentPassword) {
      setError('Enter your current password.');
      return;
    }
    if (!policy.ok) {
      setError(policy.errors[0] || 'Choose a stronger password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (admin.provider === 'firebase') {
        // Firebase owns this password: re-authenticate and update it entirely
        // in the SDK. The password is never sent to an application server.
        await reauthenticateAdmin(currentPassword);
        await updateAdminPassword(newPassword);
      } else {
        await api.changeAdminPassword(currentPassword, newPassword);
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(
        admin.provider === 'firebase'
          ? 'Password updated in Firebase Authentication. Use the new password next time you sign in.'
          : 'Password updated. Other administrator sessions were signed out.'
      );

      try {
        await onChanged();
      } catch {
        // Refresh failures do not invalidate the completed password change.
      }
    } catch (err: any) {
      if (admin.provider === 'firebase') {
        setError(describeFirebasePasswordError(err));
      } else if (err instanceof ApiError) {
        setError(err.message || 'The password could not be changed.');
      } else {
        setError(err?.message || 'The password could not be changed.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyUid = async () => {
    if (!admin.uid) return;
    try {
      await navigator.clipboard.writeText(admin.uid);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const providerLabel = admin.provider === 'firebase' ? 'Firebase Authentication' : 'Local recovery account';
  const authenticatedAt = admin.authenticatedAt
    ? new Date(admin.authenticatedAt).toLocaleString()
    : 'Unknown';

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {forced && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex items-start gap-3 text-amber-900">
          <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed">
            <p className="font-bold text-sm">Password change required</p>
            <p>
              This account is flagged for a mandatory password rotation before the console can
              be used. Set a new password below. All other administrator operations are blocked
              until then.
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-start gap-3">
          <div className="p-2.5 bg-amber-50 text-amber-700 rounded-xl">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h2 className="font-heading text-base font-bold text-slate-900">Administrator Account & Security</h2>
            <p className="text-[11px] text-slate-500">
              Identity and permissions are verified by the API on every request.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSignOut()}
            className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>

        <div className="p-5 grid sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Account</span>
            <p className="font-mono text-slate-900 break-all mt-0.5">{admin.email || admin.identifier}</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Provider</span>
            <p className="text-slate-900 mt-0.5">{providerLabel}</p>
          </div>
          {admin.uid && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Firebase UID</span>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="font-mono text-slate-900 break-all flex-1">{admin.uid}</p>
                <button
                  type="button"
                  onClick={copyUid}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
                  title="Copy UID"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Last authenticated</span>
            <p className="text-slate-900 mt-0.5 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              {authenticatedAt}
              <span
                className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                  admin.recentAuth ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {admin.recentAuth ? 'Recent' : 'Re-auth needed for sensitive actions'}
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-slate-500" />
          <div>
            <h3 className="font-heading text-sm font-bold text-slate-900">Change Password</h3>
            <p className="text-[11px] text-slate-500">
              {admin.provider === 'firebase'
                ? 'Your password is managed by Firebase Authentication. You will be re-authenticated first.'
                : 'Your current password is verified by the API before the change.'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="current-password">
              Current Password
            </label>
            <div className="relative">
              <input
                id="current-password"
                type={showCurrent ? 'text' : 'password'}
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 pr-10 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 disabled:opacity-60"
                placeholder="Enter your current password"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
                aria-label={showCurrent ? 'Hide current password' : 'Show current password'}
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="new-password">
                New Password
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  type={showNew ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-3 pr-10 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 disabled:opacity-60"
                  placeholder="At least 12 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
                  aria-label={showNew ? 'Hide new password' : 'Show new password'}
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="confirm-password">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  id="confirm-password"
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isSubmitting}
                  className={`w-full px-3 pr-10 py-2.5 text-xs bg-slate-50 border rounded-xl focus:bg-white focus:outline-none focus:ring-2 disabled:opacity-60 ${
                    passwordsMatch
                      ? 'border-slate-200 focus:ring-amber-500/20 focus:border-amber-600'
                      : 'border-rose-300 focus:ring-rose-500/20 focus:border-rose-500'
                  }`}
                  placeholder="Repeat the new password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
                  aria-label={showConfirm ? 'Hide confirmation' : 'Show confirmation'}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {!passwordsMatch && (
                <p className="text-[10px] text-rose-600 mt-1">The passwords do not match.</p>
              )}
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-slate-700">Password strength</span>
              <span
                className={`text-[11px] font-bold ${
                  policy.score >= 3
                    ? 'text-emerald-700'
                    : policy.score === 2
                    ? 'text-amber-700'
                    : 'text-rose-700'
                }`}
              >
                {newPassword ? policy.label : '—'}
              </span>
            </div>
            <div className="flex gap-1">
              {[0, 1, 2, 3].map(index => (
                <span
                  key={index}
                  className={`h-1.5 flex-1 rounded-full ${
                    newPassword && policy.score > index
                      ? policy.score >= 3
                        ? 'bg-emerald-500'
                        : 'bg-amber-500'
                      : 'bg-slate-200'
                  }`}
                />
              ))}
            </div>
            <p className="text-[10px] text-slate-500 mt-1.5 leading-snug">
              At least 12 characters, mixing upper/lower case, numbers and symbols (or a 20+
              character passphrase). Must differ from your current password and not contain your
              username.
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-[10px] text-slate-400">
              Passwords are never logged or stored by this application. Firebase-managed passwords
              are updated directly with Firebase Authentication.
            </p>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-2 cursor-pointer shrink-0"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Updating...</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Update Password</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            <h3 className="font-heading text-sm font-bold text-slate-900">Recent Security Events</h3>
          </div>
          <button
            type="button"
            onClick={loadEvents}
            className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${isLoadingEvents ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
        <div className="divide-y divide-slate-100">
          {events.length === 0 ? (
            <p className="p-5 text-xs text-slate-500">
              {isLoadingEvents ? 'Loading security events...' : 'No security events recorded yet.'}
            </p>
          ) : (
            events.map(entry => (
              <div key={entry.id} className="px-5 py-3 flex items-start gap-3 text-xs">
                <span
                  className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${
                    /Denied|Failed|Blocked|Rate Limited|Required/.test(entry.action)
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800">{entry.action}</p>
                  <p className="text-[11px] text-slate-500 break-words">{entry.details}</p>
                </div>
                <span className="text-[10px] text-slate-400 whitespace-nowrap">
                  {new Date(entry.timestamp).toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
