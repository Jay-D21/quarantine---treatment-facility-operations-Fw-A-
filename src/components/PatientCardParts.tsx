import React from 'react';
import { PatientRecord } from '../backend/database';

/**
 * Computes plain-English Today's Status Pill for a patient card:
 * - "Needs Temp Check"
 * - "Ready for Doctor"
 * - "Done for Today"
 * - "Ready for Discharge"
 */
export function getPlainPatientStatus(patient: PatientRecord): {
  label: 'Needs Temp Check' | 'Ready for Doctor' | 'Done for Today' | 'Ready for Discharge';
  pillClass: string;
} {
  if (patient.approvedForDischarge) {
    return {
      label: 'Ready for Discharge',
      pillClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    };
  }
  if (!patient.tempRecordedToday) {
    return {
      label: 'Needs Temp Check',
      pillClass: 'bg-amber-100 text-amber-900 border-amber-300',
    };
  }
  if (patient.tempRecordedToday && !patient.doctorVisitedToday) {
    return {
      label: 'Ready for Doctor',
      pillClass: 'bg-blue-100 text-blue-900 border-blue-300',
    };
  }
  return {
    label: 'Done for Today',
    pillClass: 'bg-slate-100 text-slate-800 border-slate-300',
  };
}

/**
 * 3-Day No-Fever Progress Dots:
 * 3 simple visual circles (Day 1, Day 2, Day 3) that fill up green as the patient
 * completes consecutive fever-free days (< 37.5°C).
 */
export const NoFeverProgressDots: React.FC<{ noFeverDays: number }> = ({
  noFeverDays,
}) => {
  const capped = Math.min(3, Math.max(0, noFeverDays));

  return (
    <div
      className="bg-slate-50 rounded-xl p-3 border border-slate-200/80"
      aria-label={`3-Day No-Fever Progress: ${capped} of 3 consecutive days without fever`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-semibold text-slate-700 truncate">
          3-Day No-Fever Progress (&lt; 37.5°C)
        </span>
        <span
          className={`text-xs font-bold font-tabular px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${
            capped >= 3
              ? 'bg-emerald-100 text-emerald-800'
              : capped === 2
              ? 'bg-blue-100 text-blue-800'
              : 'bg-slate-200 text-slate-700'
          }`}
        >
          {capped}/3 Days
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3].map((dayNum) => {
          const filled = capped >= dayNum;
          return (
            <div
              key={dayNum}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border text-xs font-semibold transition-colors ${
                filled
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-slate-500 border-slate-200'
              }`}
            >
              <span
                className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  filled ? 'bg-white text-emerald-700' : 'bg-slate-200 text-slate-500'
                }`}
              >
                {filled ? '✓' : dayNum}
              </span>
              <span>Day {dayNum}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
