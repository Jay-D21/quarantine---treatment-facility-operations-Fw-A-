import React from 'react';
import { FacilityMetricsSummary, StaffAccount } from '../backend/controllers';

export type ActiveRoute = '/nurse' | '/doctor' | '/admin' | '/404' | '/500';

interface TopChromeProps {
  metrics: FacilityMetricsSummary;
  currentStaff: StaffAccount;
  onRolloverDay: () => void;
  onResetFacility: () => void;
  onLogout: () => void;
}

export const TopChrome: React.FC<TopChromeProps> = ({
  metrics,
  currentStaff,
  onRolloverDay,
  onResetFacility,
  onLogout,
}) => {
  const roleBadge =
    currentStaff.role === 'NURSE'
      ? {
          label: 'Nurse Portal',
          className: 'bg-amber-100 text-amber-900 border-amber-300',
        }
      : currentStaff.role === 'DOCTOR'
      ? {
          label: 'Doctor Portal',
          className: 'bg-blue-100 text-blue-900 border-blue-300',
        }
      : {
          label: 'Admin Portal',
          className: 'bg-emerald-100 text-emerald-900 border-emerald-300',
        };

  const cureRateText =
    metrics.successRatePct !== null
      ? `${metrics.successRatePct.toFixed(0)}% / 85%`
      : '85% Goal';

  return (
    <header
      aria-label="Global Facility Navigation"
      className="sticky top-0 z-30 w-full bg-white/95 backdrop-blur-xs border-b border-slate-200 shadow-2xs"
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 flex flex-col gap-2">
        {/* Row 1: Brand + Active Role Badge + Compact Actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
              QC
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm sm:text-base font-bold text-slate-900 tracking-tight whitespace-nowrap">
                  Quarantine Care
                </span>
                <span
                  className={`hidden sm:inline-block px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${roleBadge.className}`}
                >
                  {roleBadge.label}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-600 font-medium truncate">
                <span className="sm:hidden font-bold text-slate-800">
                  {roleBadge.label} •
                </span>
                <span className="truncate">{currentStaff.staffName}</span>
                <span>•</span>
                <span className="whitespace-nowrap">Day {metrics.currentFacilityDay}</span>
              </div>
            </div>
          </div>

          {/* Compact Utility Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onRolloverDay}
              className="px-2.5 py-1.5 min-h-[34px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap"
              title="Advance to next day and reset daily check flags while keeping 3-day fever streaks"
            >
              Next Day
            </button>
            <button
              type="button"
              onClick={onResetFacility}
              className="hidden sm:inline-flex items-center px-2.5 py-1.5 min-h-[34px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap"
              title="Reset all 74 beds to initial seed state"
            >
              Reset 74 Beds
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="px-2.5 sm:px-3 py-1.5 min-h-[34px] rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold cursor-pointer transition-colors whitespace-nowrap"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Row 2: Role-Specific Single-Row KPI Strip (Only shows metrics for the logged-in role) */}
        {currentStaff.role === 'NURSE' && (
          <div
            aria-label="Nurse Daily Metrics"
            className="grid grid-cols-3 gap-2 text-xs font-tabular"
          >
            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-amber-50 text-amber-900 border border-amber-200/80">
              <span className="font-medium text-[11px] sm:text-xs">Pending:</span>
              <span className="font-bold">{metrics.tempsPendingTodayCount}</span>
            </div>
            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200/80">
              <span className="font-medium text-[11px] sm:text-xs">Checked:</span>
              <span className="font-bold">
                {metrics.tempsRecordedTodayCount}/{metrics.activeOccupancy}
              </span>
            </div>
            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-slate-50 text-slate-800 border border-slate-200">
              <span className="font-medium text-[11px] sm:text-xs">Beds:</span>
              <span className="font-bold">{metrics.activeOccupancy}/74</span>
            </div>
          </div>
        )}

        {currentStaff.role === 'DOCTOR' && (
          <div
            aria-label="Doctor Daily Metrics"
            className="grid grid-cols-3 gap-2 text-xs font-tabular"
          >
            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-blue-50 text-blue-900 border border-blue-200/80">
              <span className="font-medium text-[11px] sm:text-xs">To Visit:</span>
              <span className="font-bold">{metrics.readyForDoctorVisitCount}</span>
            </div>
            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200/80">
              <span className="font-medium text-[11px] sm:text-xs">Visited:</span>
              <span className="font-bold">
                {metrics.doctorVisitedTodayCount}/{metrics.activeOccupancy}
              </span>
            </div>
            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-slate-50 text-slate-800 border border-slate-200">
              <span className="font-medium text-[11px] sm:text-xs">Approved:</span>
              <span className="font-bold">{metrics.pendingDischargeCount}</span>
            </div>
          </div>
        )}

        {currentStaff.role === 'ADMIN' && (
          <div
            aria-label="Admin Facility Metrics"
            className="grid grid-cols-3 gap-2 text-xs font-tabular"
          >
            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-slate-50 text-slate-800 border border-slate-200">
              <span className="font-medium text-[11px] sm:text-xs">Beds:</span>
              <span className="font-bold">{metrics.activeOccupancy}/74</span>
            </div>
            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200/80">
              <span className="font-medium text-[11px] sm:text-xs">Discharge:</span>
              <span className="font-bold">{metrics.pendingDischargeCount}</span>
            </div>
            <div
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl border ${
                metrics.isMortalityAboveThreshold
                  ? 'bg-red-100 text-red-900 border-red-300 font-bold'
                  : 'bg-blue-50 text-blue-900 border-blue-200/80'
              }`}
            >
              <span className="font-medium text-[11px] sm:text-xs">Cure:</span>
              <span className="font-bold whitespace-nowrap">{cureRateText}</span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
