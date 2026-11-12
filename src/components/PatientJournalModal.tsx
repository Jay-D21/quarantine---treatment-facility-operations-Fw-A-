import React, { useEffect } from 'react';
import { getPatientJournal } from '../backend/controllers';
import { NoFeverProgressDots } from './PatientCardParts';

interface PatientJournalModalProps {
  patientId: string | null;
  onClose: () => void;
}

export const PatientJournalModal: React.FC<PatientJournalModalProps> = ({
  patientId,
  onClose,
}) => {
  useEffect(() => {
    if (!patientId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [patientId, onClose]);

  if (!patientId) return null;

  const { patient, temperatureLogs, doctorVisits } = getPatientJournal(patientId);
  if (!patient) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="journal-modal-title"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white text-slate-900 rounded-2xl p-5 sm:p-6 max-w-3xl w-full max-h-[88vh] overflow-y-auto border border-slate-200 shadow-xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="space-y-1">
            <span className="inline-block px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold font-tabular">
              Room {patient.roomId} • Bed #{patient.bedNumber} • {patient.id}
            </span>
            <h2 id="journal-modal-title" className="text-xl sm:text-2xl font-bold text-slate-900">
              {patient.fullName}, {patient.age}y
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold cursor-pointer shrink-0"
          >
            Close (Esc)
          </button>
        </div>

        <NoFeverProgressDots noFeverDays={patient.noFeverDays} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column: Daily Temperatures */}
          <div className="space-y-2.5">
            <h3 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-200">
              Daily Temperature History ({temperatureLogs.length} Days)
            </h3>
            <div className="space-y-2">
              {temperatureLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1"
                >
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-800">Day {log.facilityDay}</span>
                    <span
                      className={`font-tabular px-2 py-0.5 rounded-full ${
                        log.isCriticalEmergency
                          ? 'bg-red-600 text-white'
                          : log.hasFever
                          ? 'bg-red-100 text-red-900'
                          : 'bg-emerald-100 text-emerald-900'
                      }`}
                    >
                      {log.celsius.toFixed(1)}°C ({log.hasFever ? 'Fever' : 'Normal'})
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    By {log.recordedByName} • Streak: {log.streakAfterLog}/3 days
                  </div>
                  {log.editReason && (
                    <div className="text-[11px] font-semibold text-blue-800 bg-blue-50 px-2 py-1 rounded-lg">
                      Corrected typo: {log.editReason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Doctor Treatment Notes */}
          <div className="space-y-2.5">
            <h3 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-200">
              Doctor Visits &amp; Treatment ({doctorVisits.length})
            </h3>
            {doctorVisits.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">
                No doctor visits logged yet.
              </p>
            ) : (
              <div className="space-y-2">
                {doctorVisits.map((visit) => (
                  <div
                    key={visit.id}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1"
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                      <span>Day {visit.facilityDay} • {visit.doctorName}</span>
                      <span className="font-tabular text-slate-500">
                        {visit.tempReviewedCelsius.toFixed(1)}°C
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed">
                      {visit.treatmentNotes}
                    </p>
                    {visit.recommendedDischarge && (
                      <span className="inline-block text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                        ✓ Approved for Discharge
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
