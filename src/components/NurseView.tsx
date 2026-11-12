import React, { useState, useEffect } from 'react';
import {
  PatientRecord,
  RoomRecord,
} from '../backend/database';
import {
  FacilityMetricsSummary,
  recordDailyTemperature,
  editTodayTemperature,
  SURVIVAL_MIN_TEMP_C,
  SURVIVAL_MAX_TEMP_C,
} from '../backend/controllers';
import {
  NoFeverProgressDots,
  getPlainPatientStatus,
} from './PatientCardParts';

interface NurseViewProps {
  patients: PatientRecord[];
  rooms: RoomRecord[];
  metrics: FacilityMetricsSummary;
  staffName: string;
  onSelectJournal: (patientId: string) => void;
}

type NurseFilterMode = 'PENDING_TODAY' | 'RECORDED_TODAY' | 'ALL_ACTIVE';

export const NurseView: React.FC<NurseViewProps> = ({
  patients,
  rooms,
  metrics,
  staffName,
  onSelectJournal,
}) => {
  const [filterMode, setFilterMode] = useState<NurseFilterMode>('PENDING_TODAY');
  const [selectedRoomId, setSelectedRoomId] = useState<number | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [feedbackBanner, setFeedbackBanner] = useState<{
    isCritical?: boolean;
    message: string;
  } | null>(null);

  // Primary Temperature Entry Modal State
  const [activePatient, setActivePatient] = useState<PatientRecord | null>(null);
  const [tempValue, setTempValue] = useState('36.8');
  const [modalError, setModalError] = useState<string | null>(null);
  const [pendingCriticalConfirm, setPendingCriticalConfirm] = useState(false);

  // "Correct typo" Audited Edit Modal State
  const [editingPatient, setEditingPatient] = useState<PatientRecord | null>(null);
  const [editTempValue, setEditTempValue] = useState('');
  const [editReasonValue, setEditReasonValue] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editPendingCriticalConfirm, setEditPendingCriticalConfirm] = useState(false);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActivePatient(null);
        setEditingPatient(null);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const activePatients = patients.filter((p) => p.status === 'ACTIVE');

  const filteredPatients = activePatients.filter((p) => {
    if (filterMode === 'PENDING_TODAY' && p.tempRecordedToday) return false;
    if (filterMode === 'RECORDED_TODAY' && !p.tempRecordedToday) return false;
    if (selectedRoomId !== 'ALL' && p.roomId !== selectedRoomId) return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.trim().toLowerCase();
      const matchName = p.fullName.toLowerCase().includes(q);
      const matchId = p.id.toLowerCase().includes(q);
      const matchBed =
        `bed ${p.bedNumber}`.includes(q) ||
        `room ${p.roomId}`.includes(q) ||
        String(p.bedNumber) === q;
      if (!matchName && !matchId && !matchBed) return false;
    }
    return true;
  });

  const openEnterTempModal = (patient: PatientRecord) => {
    setActivePatient(patient);
    setTempValue('36.8');
    setModalError(null);
    setPendingCriticalConfirm(false);
  };

  const submitTemperature = (valToSubmit: string, confirmCritical = false) => {
    if (!activePatient) return;

    const result = recordDailyTemperature({
      patientId: activePatient.id,
      celsiusInput: valToSubmit,
      nurseName: staffName,
      confirmCriticalWarning: confirmCritical,
    });

    if (!result.ok) {
      if (result.requiresConfirmation) {
        setPendingCriticalConfirm(true);
        setModalError(
          result.error ||
            'Critical life-threatening temperature entered. Please confirm this is not a typo.'
        );
        return;
      }
      setPendingCriticalConfirm(false);
      setModalError(result.error || 'Invalid temperature.');
      return;
    }

    const updated = result.data!;
    setActivePatient(null);
    setPendingCriticalConfirm(false);
    setModalError(null);

    if (updated.isCriticalEmergency) {
      setFeedbackBanner({
        isCritical: true,
        message: `CRITICAL EMERGENCY FLAGGED: ${updated.fullName} (Room ${updated.roomId} • Bed #${updated.bedNumber}) logged at ${updated.todayTempCelsius?.toFixed(1)}°C and flagged for urgent medical review.`,
      });
    } else if (updated.noFeverDays >= 3 && !updated.todayHasFever) {
      setFeedbackBanner({
        message: `✓ Saved ${updated.todayTempCelsius?.toFixed(1)}°C for ${updated.fullName} (Bed #${updated.bedNumber}). Completed 3/3 fever-free days!`,
      });
    } else {
      setFeedbackBanner({
        message: `✓ Saved ${updated.todayTempCelsius?.toFixed(1)}°C for ${updated.fullName} (Bed #${updated.bedNumber}). Fever-free streak: ${updated.noFeverDays}/3 days.`,
      });
    }
  };

  const openCorrectTypoModal = (patient: PatientRecord) => {
    setEditingPatient(patient);
    setEditTempValue(
      patient.todayTempCelsius !== null ? patient.todayTempCelsius.toFixed(1) : '36.8'
    );
    setEditReasonValue('');
    setEditError(null);
    setEditPendingCriticalConfirm(false);
  };

  const handleAuditedEditSubmit = (e: React.FormEvent, confirmCritical = false) => {
    e.preventDefault();
    if (!editingPatient) return;

    const result = editTodayTemperature({
      patientId: editingPatient.id,
      newCelsiusInput: editTempValue,
      editReason: editReasonValue,
      clinicianName: staffName,
      confirmCriticalWarning: confirmCritical,
    });

    if (!result.ok) {
      if (result.requiresConfirmation) {
        setEditPendingCriticalConfirm(true);
        setEditError(
          result.error ||
            'Critical life-threatening temperature entered. Please confirm this is not a typo.'
        );
        return;
      }
      setEditPendingCriticalConfirm(false);
      setEditError(result.error || 'Could not update temperature.');
      return;
    }

    const updated = result.data!;
    setFeedbackBanner({
      isCritical: updated.isCriticalEmergency,
      message: `Updated today's temperature for ${updated.fullName} to ${updated.todayTempCelsius?.toFixed(1)}°C (Streak: ${updated.noFeverDays}/3 days).`,
    });
    setEditingPatient(null);
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 space-y-4 overflow-x-hidden">
      {/* Live Feedback Toast Banner (Strictly Nurse-scoped) */}
      <div aria-live="polite">
        {feedbackBanner && (
          <div
            className={`rounded-2xl p-3.5 border flex items-center justify-between gap-3 ${
              feedbackBanner.isCritical
                ? 'bg-red-50 border-red-300 text-red-950'
                : 'bg-emerald-50 border-emerald-200 text-emerald-950'
            }`}
          >
            <p className="text-xs sm:text-sm font-semibold">{feedbackBanner.message}</p>
            <button
              type="button"
              onClick={() => setFeedbackBanner(null)}
              className="px-3 py-1.5 min-h-[34px] rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-bold cursor-pointer shrink-0"
            >
              Close
            </button>
          </div>
        )}
      </div>

      {/* Compact Section Header & Filter Controls */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-5 shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900">
              Nurse Check — Daily Patient Temperatures
            </h1>
            <p className="text-xs text-slate-600 mt-0.5">
              Tap a patient card to log today&apos;s temperature. 3 days in a row &lt; 37.5°C completes the fever-free streak.
            </p>
          </div>

          {/* Side-by-side Room Filter & Search on all screen sizes */}
          <div className="grid grid-cols-12 gap-2 w-full lg:w-auto lg:min-w-[400px]">
            <select
              aria-label="Filter by Room"
              value={selectedRoomId}
              onChange={(e) =>
                setSelectedRoomId(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))
              }
              className="col-span-5 min-h-[40px] px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs sm:text-sm font-medium w-full"
            >
              <option value="ALL">All Rooms (1–10)</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.capacity})
                </option>
              ))}
            </select>

            <input
              type="search"
              aria-label="Search patient name or bed"
              placeholder="Search name or bed #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="col-span-7 min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs sm:text-sm w-full"
            />
          </div>
        </div>

        {/* Single-Row 3-Tab Segmented Filter Control */}
        <div
          role="group"
          aria-label="Filter Patients by Today's Temperature Check"
          className="grid grid-cols-3 gap-1.5 sm:inline-flex sm:flex-wrap bg-slate-100 p-1 rounded-xl w-full sm:w-auto"
        >
          <button
            type="button"
            onClick={() => setFilterMode('PENDING_TODAY')}
            className={`min-h-[38px] px-2 sm:px-4 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors whitespace-nowrap ${
              filterMode === 'PENDING_TODAY'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-700 hover:bg-slate-200/70'
            }`}
          >
            To Check ({metrics.tempsPendingTodayCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('RECORDED_TODAY')}
            className={`min-h-[38px] px-2.5 sm:px-4 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors truncate ${
              filterMode === 'RECORDED_TODAY'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-700 hover:bg-slate-200/70'
            }`}
          >
            Checked ({metrics.tempsRecordedTodayCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('ALL_ACTIVE')}
            className={`min-h-[38px] px-2.5 sm:px-4 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors truncate ${
              filterMode === 'ALL_ACTIVE'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-700 hover:bg-slate-200/70'
            }`}
          >
            All Beds ({metrics.activeOccupancy})
          </button>
        </div>
      </div>

      {/* Responsive Patient Card Grid (1 col mobile, 2 tablet, 3 desktop) */}
      {filteredPatients.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            No patients in this filter view
          </h2>
          <p className="text-xs sm:text-sm text-slate-600">
            Switch filter tabs above or clear the search box to see other patients.
          </p>
          <button
            type="button"
            onClick={() => {
              setFilterMode('ALL_ACTIVE');
              setSelectedRoomId('ALL');
              setSearchQuery('');
            }}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 text-white text-xs sm:text-sm font-semibold cursor-pointer"
          >
            Show All {metrics.activeOccupancy} Occupied Beds
          </button>
        </div>
      ) : (
        <div
          aria-label="Patient Cards Grid"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4"
        >
          {filteredPatients.map((patient) => {
            const statusInfo = getPlainPatientStatus(patient);

            return (
              <article
                key={patient.id}
                className={`bg-white rounded-2xl border p-4 sm:p-5 flex flex-col justify-between gap-3.5 shadow-2xs transition-all ${
                  patient.isCriticalEmergency
                    ? 'border-red-500 ring-2 ring-red-200'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="space-y-3">
                  {/* Top Row: Room & Bed Badge + Today's Status Pill */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 text-xs font-bold font-tabular whitespace-nowrap">
                      Room {patient.roomId} • Bed #{patient.bedNumber}
                    </span>

                    <div className="flex items-center gap-1.5 min-w-0">
                      {patient.isCriticalEmergency && (
                        <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold uppercase tracking-wide whitespace-nowrap">
                          CRITICAL
                        </span>
                      )}
                      <span
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold border whitespace-nowrap ${statusInfo.pillClass}`}
                      >
                        {statusInfo.label}
                      </span>
                    </div>
                  </div>

                  {/* Indian Patient Name & Age + Today's Temp Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-snug truncate">
                        {patient.fullName}, {patient.age}y
                      </h2>
                      <p className="text-xs text-slate-500 font-tabular mt-0.5">
                        {patient.id} •{' '}
                        <button
                          type="button"
                          onClick={() => onSelectJournal(patient.id)}
                          className="text-blue-600 hover:underline font-semibold cursor-pointer bg-transparent border-none p-0"
                        >
                          Past Temps
                        </button>
                      </p>
                    </div>

                    {patient.tempRecordedToday && patient.todayTempCelsius !== null && (
                      <div
                        className={`px-2.5 py-1 rounded-xl text-right font-tabular border shrink-0 ${
                          patient.isCriticalEmergency
                            ? 'bg-red-100 text-red-900 border-red-300'
                            : patient.todayHasFever
                            ? 'bg-red-50 text-red-800 border-red-200'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}
                      >
                        <div className="text-sm font-bold">
                          {patient.todayTempCelsius.toFixed(1)}°C
                        </div>
                        <div className="text-[10px] font-semibold">
                          {patient.todayHasFever ? 'Fever' : 'Normal'}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 3-Day No-Fever Progress Dots */}
                  <NoFeverProgressDots noFeverDays={patient.noFeverDays} />
                </div>

                {/* Bottom Row: One Big Primary Action Button (min-h-[44px]) */}
                <div>
                  {!patient.tempRecordedToday ? (
                    <button
                      type="button"
                      onClick={() => openEnterTempModal(patient)}
                      className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm cursor-pointer transition-colors flex items-center justify-center gap-2"
                    >
                      <span>+ Enter Today&apos;s Temp</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled
                        className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 text-slate-500 font-bold text-xs sm:text-sm border border-slate-200 cursor-not-allowed truncate"
                      >
                        ✓ Temp Logged ({patient.todayTempCelsius?.toFixed(1)}°C)
                      </button>
                      <button
                        type="button"
                        onClick={() => openCorrectTypoModal(patient)}
                        className="min-h-[44px] px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold text-xs cursor-pointer shrink-0"
                      >
                        Correct typo
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Modal 1: Nurse Enter Today's Temp Modal with Quick-Tap Presets + Survival Bounds Validation */}
      {activePatient && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="enter-temp-modal-title"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setActivePatient(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 border border-slate-200 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="inline-block px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-bold font-tabular">
                  Room {activePatient.roomId} • Bed #{activePatient.bedNumber}
                </span>
                <h2 id="enter-temp-modal-title" className="text-lg sm:text-xl font-bold text-slate-900 mt-1">
                  {activePatient.fullName}, {activePatient.age}y
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Current streak: <strong>{activePatient.noFeverDays}/3 fever-free days</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActivePatient(null)}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Esc
              </button>
            </div>

            {/* Quick-Tap Preset Pills */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                1-Tap Quick Presets
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => submitTemperature('36.8', false)}
                  className="min-h-[44px] px-2 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-bold font-tabular cursor-pointer"
                >
                  36.8°C Normal
                </button>
                <button
                  type="button"
                  onClick={() => submitTemperature('37.2', false)}
                  className="min-h-[44px] px-2 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-bold font-tabular cursor-pointer"
                >
                  37.2°C Normal
                </button>
                <button
                  type="button"
                  onClick={() => submitTemperature('38.4', false)}
                  className="min-h-[44px] px-2 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-900 border border-red-300 text-xs font-bold font-tabular cursor-pointer"
                >
                  38.4°C Fever
                </button>
              </div>
            </div>

            {/* Manual Temperature Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitTemperature(tempValue, pendingCriticalConfirm);
              }}
              className="space-y-4 pt-2 border-t border-slate-200"
            >
              <div>
                <label
                  htmlFor="modal-temp-input"
                  className="block text-sm font-bold text-slate-800 mb-1"
                >
                  Or Type Exact Temperature (°C)
                </label>
                <p className="text-xs text-slate-500 mb-2">
                  Human survival bounds: {SURVIVAL_MIN_TEMP_C}°C to {SURVIVAL_MAX_TEMP_C}°C. Fever is &ge; 37.5°C.
                </p>
                <input
                  id="modal-temp-input"
                  type="number"
                  step="0.1"
                  value={tempValue}
                  onChange={(e) => {
                    setTempValue(e.target.value);
                    setModalError(null);
                    setPendingCriticalConfirm(false);
                  }}
                  className="w-full min-h-[46px] px-4 py-2 rounded-xl border border-slate-300 text-lg font-bold font-tabular text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>

              {modalError && (
                <div
                  role="alert"
                  className={`p-3.5 rounded-xl border text-xs font-semibold space-y-2 ${
                    pendingCriticalConfirm
                      ? 'bg-red-50 border-red-400 text-red-900'
                      : 'bg-amber-50 border-amber-300 text-amber-950'
                  }`}
                >
                  <p>{modalError}</p>
                  {pendingCriticalConfirm && (
                    <button
                      type="button"
                      onClick={() => submitTemperature(tempValue, true)}
                      className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs cursor-pointer"
                    >
                      Confirm Critical Temperature ({tempValue}°C) &amp; Flag Emergency
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setActivePatient(null)}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold cursor-pointer"
                >
                  Save Temperature
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: "Correct typo" Audited Edit Modal */}
      {editingPatient && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="correct-typo-modal-title"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setEditingPatient(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 border border-slate-200 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <span className="inline-block px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-bold font-tabular">
                Room {editingPatient.roomId} • Bed #{editingPatient.bedNumber}
              </span>
              <h2 id="correct-typo-modal-title" className="text-lg sm:text-xl font-bold text-slate-900 mt-1">
                Correct Today&apos;s Temp — {editingPatient.fullName}
              </h2>
              <p className="text-xs text-slate-600 mt-1">
                Current reading: <strong>{editingPatient.todayTempCelsius?.toFixed(1)}°C</strong>. Enter the corrected temperature and a short reason.
              </p>
            </div>

            <form
              onSubmit={(e) => handleAuditedEditSubmit(e, editPendingCriticalConfirm)}
              className="space-y-4"
            >
              <div>
                <label
                  htmlFor="edit-temp-input"
                  className="block text-sm font-bold text-slate-800 mb-1"
                >
                  Corrected Temperature (°C)
                </label>
                <input
                  id="edit-temp-input"
                  type="number"
                  step="0.1"
                  value={editTempValue}
                  onChange={(e) => {
                    setEditTempValue(e.target.value);
                    setEditError(null);
                    setEditPendingCriticalConfirm(false);
                  }}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-base font-bold font-tabular text-slate-900"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="edit-reason-input"
                  className="block text-sm font-bold text-slate-800 mb-1"
                >
                  Reason for Correction
                </label>
                <input
                  id="edit-reason-input"
                  type="text"
                  placeholder="e.g. Thermometer re-check / typing mistake"
                  value={editReasonValue}
                  onChange={(e) => setEditReasonValue(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm text-slate-900"
                  required
                />
              </div>

              {editError && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-red-50 border border-red-300 text-red-900 text-xs font-semibold space-y-2"
                >
                  <p>{editError}</p>
                  {editPendingCriticalConfirm && (
                    <button
                      type="button"
                      onClick={(e) => handleAuditedEditSubmit(e as unknown as React.FormEvent, true)}
                      className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-red-600 text-white font-bold text-xs cursor-pointer"
                    >
                      Confirm Critical Temperature &amp; Save
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingPatient(null)}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold cursor-pointer"
                >
                  Save Correction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
