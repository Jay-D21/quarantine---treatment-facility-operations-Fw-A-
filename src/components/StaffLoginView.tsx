import React, { useState } from 'react';
import {
  STAFF_ACCOUNTS,
  StaffAccount,
  authenticateStaffCredentials,
  FacilityMetricsSummary,
} from '../backend/controllers';

interface StaffLoginViewProps {
  onLoginSuccess: (account: StaffAccount) => void;
  metrics: FacilityMetricsSummary;
}

export const StaffLoginView: React.FC<StaffLoginViewProps> = ({
  onLoginSuccess,
  metrics,
}) => {
  const [email, setEmail] = useState('nurse@facility.in');
  const [password, setPassword] = useState('nurse123');
  const [error, setError] = useState<string | null>(null);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = authenticateStaffCredentials(email, password);
    if (!res.ok || !res.data) {
      setError(res.error || 'Invalid credentials.');
      return;
    }
    onLoginSuccess(res.data);
  };

  const handleOneClickLogin = (account: StaffAccount) => {
    setError(null);
    setEmail(account.email);
    setPassword(account.password);
    onLoginSuccess(account);
  };

  return (
    <div className="min-h-screen w-full bg-[#F8FAFC] text-slate-900 flex flex-col justify-between p-4 sm:p-6 lg:p-10 overflow-x-hidden">
      <div className="max-w-5xl w-full mx-auto my-auto py-4">
        {/* Clean Facility Header */}
        <div className="text-center max-w-2xl mx-auto mb-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-xs sm:text-sm font-semibold mb-3">
            <span>74-Bed Quarantine &amp; Treatment Centre</span>
            <span>•</span>
            <span>Day {metrics.currentFacilityDay}</span>
            <span>•</span>
            <span>{metrics.activeOccupancy}/74 Beds Occupied</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-slate-900">
            Clinical Staff Portal
          </h1>
          <p className="text-sm sm:text-base text-slate-600 mt-2">
            Simple daily patient care: <strong>1. Nurse Check</strong> (daily temperature) →{' '}
            <strong>2. Doctor Visit</strong> (treatment &amp; 3-day cure approval) →{' '}
            <strong>3. Admin &amp; Beds</strong> (discharge &amp; admission).
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 7 Cols: 1-Click Auto-Login Cards with Displayed Credentials */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs">
              <h2 className="text-lg font-bold text-slate-900">
                1-Click Staff Role Login (Evaluator Quick Access)
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Tap any staff card below to sign in immediately, or use the credentials in the login form.
              </p>

              <div className="mt-4 flex flex-col gap-3">
                {STAFF_ACCOUNTS.map((acc) => {
                  const badgeStyles =
                    acc.role === 'NURSE'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : acc.role === 'DOCTOR'
                      ? 'bg-blue-50 text-blue-800 border-blue-200'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200';

                  const buttonStyles =
                    acc.role === 'NURSE'
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : acc.role === 'DOCTOR'
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white';

                  const queueSummary =
                    acc.role === 'NURSE'
                      ? `${metrics.tempsPendingTodayCount} patients need today's temp`
                      : acc.role === 'DOCTOR'
                      ? `${metrics.readyForDoctorVisitCount} patients ready for doctor`
                      : `${metrics.pendingDischargeCount} cured patients ready for discharge`;

                  return (
                    <div
                      key={acc.role}
                      className="rounded-2xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-slate-300 transition-colors bg-slate-50/60"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${badgeStyles}`}
                          >
                            {acc.role === 'NURSE'
                              ? 'Nurse Login'
                              : acc.role === 'DOCTOR'
                              ? 'Doctor Login'
                              : 'Admin Login'}
                          </span>
                          <span className="text-base font-bold text-slate-900">
                            {acc.staffName}
                          </span>
                        </div>
                        <div className="text-xs sm:text-sm font-tabular text-slate-700">
                          ID: <strong className="select-all">{acc.email}</strong> | Pass:{' '}
                          <strong className="select-all">{acc.password}</strong>
                        </div>
                        <p className="text-xs text-slate-500">{queueSummary}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleOneClickLogin(acc)}
                        className={`min-h-[44px] px-4 py-2.5 rounded-xl font-semibold text-sm cursor-pointer transition-colors shrink-0 ${buttonStyles}`}
                      >
                        Login as {acc.role === 'NURSE' ? 'Nurse' : acc.role === 'DOCTOR' ? 'Doctor' : 'Admin'} →
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right 5 Cols: Standard Email & Password Login Form */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs">
            <h2 className="text-lg font-bold text-slate-900">
              Sign In with Staff Credentials
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Enter your facility email and password below.
            </p>

            <form onSubmit={handleFormSubmit} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="login-email-input"
                  className="block text-sm font-semibold text-slate-800 mb-1.5"
                >
                  Staff Email ID
                </label>
                <input
                  id="login-email-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nurse@facility.in"
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="login-password-input"
                  className="block text-sm font-semibold text-slate-800 mb-1.5"
                >
                  Password
                </label>
                <input
                  id="login-password-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs text-slate-500">Fill credentials:</span>
                {STAFF_ACCOUNTS.map((acc) => (
                  <button
                    key={acc.role}
                    type="button"
                    onClick={() => {
                      setEmail(acc.email);
                      setPassword(acc.password);
                      setError(null);
                    }}
                    className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                  >
                    {acc.role}
                  </button>
                ))}
              </div>

              {error && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base cursor-pointer transition-colors"
              >
                Sign In to Workspace
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
