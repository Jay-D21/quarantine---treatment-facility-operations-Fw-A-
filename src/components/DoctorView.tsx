import React, { useState, useEffect } from 'react';
import {
  PatientRecord,
  RoomRecord,
} from '../backend/database';
import {
  FacilityMetricsSummary,
  recordDoctorVisit,
  approvePatientForDischarge,
  recordPatientMortality,
  REQUIRED_NO_FEVER_DAYS,
} from '../backend/controllers';
import {
  NoFeverProgressDots,
  getPlainPatientStatus,
} from './PatientCardParts';

interface DoctorViewProps {
  patients: PatientRecord[];
  rooms: RoomRecord[];
  metrics: FacilityMetricsSummary;
  staffName: string;
  onSelectJournal: (patientId: string) => void;
}

type DoctorQueueFilter =
  | 'READY_FOR_VISIT'
  | 'DISCHARGE_ELIGIBLE'
  | 'NEEDS_NURSE_TEMP'
  | 'VISITED_TODAY';

export const DoctorView: React.FC<DoctorViewProps> = ({
  patients,
  rooms,
  metrics,
  staffName,
  onSelectJournal,
}) => {
  const [queueFilter, setQueueFilter] = useState<DoctorQueueFilter>('READY_FOR_VISIT');
  const [selectedRoomId, setSelectedRoomId] = useState<number | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [statusBanner, setStatusBanner] = useState<{
    message: string;
  } | null>(null);

  // Consultation & Treatment Modal State
  const [consultPatient, setConsultPatient] = useState<PatientRecord | null>(null);
  const [treatmentNote, setTreatmentNote] = useState('');
  const [overrideTemp, setOverrideTemp] = useState('36.8');
  const [alsoApproveDischarge, setAlsoApproveDischarge] = useState(false);
  const [consultError, setConsultError] = useState<string | null>(null);
  const [pendingCriticalConfirm, setPendingCriticalConfirm] = useState(false);

  // Mortality Modal State
  const [mortalityPatient, setMortalityPatient] = useState<PatientRecord | null>(null);
  const [mortalityCause, setMortalityCause] = useState('');
  const [mortalityError, setMortalityError] = useState<string | null>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setConsultPatient(null);
        setMortalityPatient(null);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const activePatients = patients.filter((p) => p.status === 'ACTIVE');
  const isSearching = searchQuery.trim().length > 0;

  const dischargeEligibleReadyCount = activePatients.filter(
    (p) =>
      p.tempRecordedToday &&
      p.noFeverDays >= REQUIRED_NO_FEVER_DAYS &&
      !p.todayHasFever &&
      !p.isCriticalEmergency &&
      !p.approvedForDischarge
  ).length;

  // Filter patients and sort CRITICAL EMERGENCY patients to the very top of the Doctor's queue!
  const displayedPatients = activePatients
    .filter((p) => {
      if (selectedRoomId !== 'ALL' && p.roomId !== selectedRoomId) return false;

      if (isSearching) {
        const q = searchQuery.trim().toLowerCase();
        const matchName = p.fullName.toLowerCase().includes(q);
        const matchId = p.id.toLowerCase().includes(q);
        const matchBed =
          `bed ${p.bedNumber}`.includes(q) ||
          `room ${p.roomId}`.includes(q) ||
          String(p.bedNumber) === q;
        return matchName || matchId || matchBed;
      }

      if (queueFilter === 'READY_FOR_VISIT') {
        return p.tempRecordedToday && !p.doctorVisitedToday;
      }
      if (queueFilter === 'DISCHARGE_ELIGIBLE') {
        return (
          p.tempRecordedToday &&
          p.noFeverDays >= REQUIRED_NO_FEVER_DAYS &&
          !p.todayHasFever &&
          !p.isCriticalEmergency &&
          !p.approvedForDischarge
        );
      }
      if (queueFilter === 'NEEDS_NURSE_TEMP') {
        return !p.tempRecordedToday;
      }
      if (queueFilter === 'VISITED_TODAY') {
        return p.doctorVisitedToday;
      }
      return true;
    })
    .sort((a, b) => {
      if (a.isCriticalEmergency && !b.isCriticalEmergency) return -1;
      if (!a.isCriticalEmergency && b.isCriticalEmergency) return 1;
      return a.bedNumber - b.bedNumber;
    });

  const openConsultModal = (patient: PatientRecord) => {
    setConsultPatient(patient);
    const defaultNote =
      patient.noFeverDays >= REQUIRED_NO_FEVER_DAYS && !patient.todayHasFever
        ? 'Completed 3 consecutive fever-free days (< 37.5°C). Fit for discharge.'
        : patient.todayHasFever
        ? 'Paracetamol 650mg TDS + continue oral antiviral regimen and hydration.'
        : 'Afebrile today (< 37.5°C). Continue maintenance antiviral and supportive care.';
    setTreatmentNote(defaultNote);
    setOverrideTemp('36.8');
    setAlsoApproveDischarge(
      patient.noFeverDays >= REQUIRED_NO_FEVER_DAYS &&
        patient.todayHasFever === false &&
        !patient.isCriticalEmergency
    );
    setConsultError(null);
    setPendingCriticalConfirm(false);
  };

  const handleConsultSubmit = (e: React.FormEvent, confirmCritical = false) => {
    e.preventDefault();
    if (!consultPatient) return;

    const result = recordDoctorVisit({
      patientId: consultPatient.id,
      treatmentNotes: treatmentNote,
      approveForDischarge: alsoApproveDischarge,
      overrideCelsiusInput: !consultPatient.tempRecordedToday ? overrideTemp : undefined,
      doctorName: staffName,
      confirmCriticalWarning: confirmCritical,
    });

    if (!result.ok || !result.data) {
      if (result.requiresConfirmation) {
        setPendingCriticalConfirm(true);
        setConsultError(
          result.error ||
            'Critical life-threatening temperature entered. Please confirm this is not a typo.'
        );
        return;
      }
      setPendingCriticalConfirm(false);
      setConsultError(result.error || 'Could not log doctor visit.');
      return;
    }

    const updated = result.data;
    setConsultPatient(null);
    setStatusBanner({
      message: updated.approvedForDischarge
        ? `✓ Approved ${updated.fullName} (Room ${updated.roomId} • Bed #${updated.bedNumber}) for Discharge after 3/3 fever-free days.`
        : `✓ Logged Doctor Visit & Treatment for ${updated.fullName} (Room ${updated.roomId} • Bed #${updated.bedNumber}).`,
    });
  };

  const handleQuickApproveDischarge = (patient: PatientRecord) => {
    const result = approvePatientForDischarge({
      patientId: patient.id,
      doctorName: staffName,
    });

    if (!result.ok || !result.data) {
      setStatusBanner({
        message: result.error || 'Could not approve discharge.',
      });
      return;
    }

    setStatusBanner({
      message: `✓ Approved ${result.data.fullName} (Room ${result.data.roomId} • Bed #${result.data.bedNumber}) for Discharge after 3/3 fever-free days!`,
    });
  };

  const handleConfirmMortality = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mortalityPatient) return;

    const result = recordPatientMortality({
      patientId: mortalityPatient.id,
      clinicalCauseNote: mortalityCause,
      doctorName: staffName,
    });

    if (!result.ok || !result.data) {
      setMortalityError(result.error || 'Could not record mortality.');
      return;
    }

    setStatusBanner({
      message: `Recorded clinical mortality outcome for ${result.data.patientName} (Room ${result.data.roomId} • Bed #${result.data.bedNumber}).`,
    });
    setMortalityPatient(null);
    setMortalityCause('');
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 space-y-4 overflow-x-hidden">
      {/* Live Feedback Toast Banner (Strictly Doctor-scoped) */}
      <div aria-live="polite">
        {statusBanner && (
          <div className="rounded-2xl p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-center justify-between gap-3">
            <p className="text-xs sm:text-sm font-semibold">{statusBanner.message}</p>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="px-3 py-1.5 min-h-[34px] rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-bold cursor-pointer shrink-0"
            >
              Close
            </button>
          </div>
        )}
      </div>

      {/* Warning Banner when Doctor filters to view patients without today's nurse temperature */}
      {queueFilter === 'NEEDS_NURSE_TEMP' && !isSearching && (
        <div
          role="alert"
          className="rounded-2xl p-3.5 bg-amber-50 border border-amber-300 text-amber-950"
        >
          <p className="text-xs sm:text-sm font-bold">
            Warning: Today&apos;s temperature has NOT been recorded by a nurse for these patients.
          </p>
          <p className="text-xs text-amber-900 mt-0.5">
            Tapping <strong>+ Log Visit &amp; Treatment</strong> on any card below lets you record their temperature and treatment note together.
          </p>
        </div>
      )}

      {/* Compact Header & Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-5 shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900">
              Doctor Visit — Treatment &amp; 3-Day Cure Approval
            </h1>
            <p className="text-xs text-slate-600 mt-0.5">
              Review patients with today&apos;s temperature logged. Patients with 3/3 green dots qualify for discharge approval.
            </p>
          </div>

          {/* Side-by-side Room Select + Search Input on all viewports */}
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
                  {r.name}
                </option>
              ))}
            </select>

            <input
              type="search"
              aria-label="Search any patient"
              placeholder="Search patient or bed #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="col-span-7 min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs sm:text-sm w-full"
            />
          </div>
        </div>

        {/* Clean 2x2 Mobile / 4-Col Desktop Segmented Filter Grid */}
        <div
          role="group"
          aria-label="Doctor Queue Filter"
          className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-slate-100 p-1 rounded-xl"
        >
          <button
            type="button"
            onClick={() => {
              setQueueFilter('READY_FOR_VISIT');
              setSearchQuery('');
            }}
            className={`min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors truncate ${
              !isSearching && queueFilter === 'READY_FOR_VISIT'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-700 hover:bg-slate-200/70'
            }`}
          >
            Ready ({metrics.readyForDoctorVisitCount})
          </button>
          <button
            type="button"
            onClick={() => {
              setQueueFilter('DISCHARGE_ELIGIBLE');
              setSearchQuery('');
            }}
            className={`min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors truncate ${
              !isSearching && queueFilter === 'DISCHARGE_ELIGIBLE'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'text-emerald-900 bg-emerald-100/70 hover:bg-emerald-200/70'
            }`}
          >
            ✓ 3/3 Cure ({dischargeEligibleReadyCount})
          </button>
          <button
            type="button"
            onClick={() => {
              setQueueFilter('NEEDS_NURSE_TEMP');
              setSearchQuery('');
            }}
            className={`min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors truncate ${
              !isSearching && queueFilter === 'NEEDS_NURSE_TEMP'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'text-slate-700 hover:bg-slate-200/70'
            }`}
          >
            No Temp ({metrics.tempsPendingTodayCount})
          </button>
          <button
            type="button"
            onClick={() => {
              setQueueFilter('VISITED_TODAY');
              setSearchQuery('');
            }}
            className={`min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors truncate ${
              !isSearching && queueFilter === 'VISITED_TODAY'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-700 hover:bg-slate-200/70'
            }`}
          >
            Done ({metrics.doctorVisitedTodayCount})
          </button>
        </div>
      </div>

      {/* Responsive Patient Card Grid (1 col mobile, 2 tablet, 3 desktop) */}
      {displayedPatients.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            No patients in this Doctor queue view
          </h2>
          <p className="text-xs sm:text-sm text-slate-600">
            Switch filter tabs above or search by patient name/bed.
          </p>
        </div>
      ) : (
        <div
          aria-label="Doctor Consultation Cards Grid"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4"
        >
          {displayedPatients.map((patient) => {
            const statusInfo = getPlainPatientStatus(patient);
            const canApproveDischarge =
              patient.tempRecordedToday &&
              patient.noFeverDays >= REQUIRED_NO_FEVER_DAYS &&
              patient.todayHasFever === false &&
              !patient.isCriticalEmergency;

            return (
              <article
                key={patient.id}
                className={`bg-white rounded-2xl border p-4 sm:p-5 flex flex-col justify-between gap-3.5 shadow-2xs transition-all ${
                  patient.isCriticalEmergency
                    ? 'border-red-600 ring-2 ring-red-200 bg-red-50/20'
                    : canApproveDischarge && !patient.approvedForDischarge
                    ? 'border-emerald-300'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="space-y-3">
                  {/* Critical Emergency Alert Strip */}
                  {patient.isCriticalEmergency && (
                    <div
                      role="alert"
                      className="px-3 py-1.5 rounded-xl bg-red-600 text-white text-xs font-bold flex items-center justify-between"
                    >
                      <span>CRITICAL EMERGENCY</span>
                      <span className="font-tabular">{patient.todayTempCelsius?.toFixed(1)}°C</span>
                    </div>
                  )}

                  {/* Missing Nurse Temp Warning on Card */}
                  {!patient.tempRecordedToday && (
                    <div
                      role="alert"
                      className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs font-semibold"
                    >
                      Temp not yet recorded by nurse today — Doctor override required.
                    </div>
                  )}

                  {/* Top Row: Room & Bed Badge + Today's Status Pill */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 text-xs font-bold font-tabular whitespace-nowrap">
                      Room {patient.roomId} • Bed #{patient.bedNumber}
                    </span>
                    <span
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold border whitespace-nowrap ${statusInfo.pillClass}`}
                    >
                      {statusInfo.label}
                    </span>
                  </div>

                  {/* Indian Patient Name & Age + Today's Recorded Temp */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-snug truncate">
                        {patient.fullName}, {patient.age}y
                      </h2>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                        <span className="font-tabular">{patient.id}</span>
                        <span>•</span>
                        <button
                          type="button"
                          onClick={() => onSelectJournal(patient.id)}
                          className="text-blue-600 hover:underline font-semibold cursor-pointer bg-transparent border-none p-0"
                        >
                          Journal
                        </button>
                        <span>•</span>
                        <button
                          type="button"
                          onClick={() => {
                            setMortalityPatient(patient);
                            setMortalityCause('');
                            setMortalityError(null);
                          }}
                          className="text-red-600 hover:underline font-semibold cursor-pointer bg-transparent border-none p-0"
                        >
                          Mortality
                        </button>
                      </div>
                    </div>

                    {patient.tempRecordedToday && patient.todayTempCelsius !== null ? (
                      <div
                        className={`px-2.5 py-1 rounded-xl text-right font-tabular border shrink-0 ${
                          patient.todayHasFever
                            ? 'bg-red-50 text-red-900 border-red-200'
                            : 'bg-emerald-50 text-emerald-900 border-emerald-200'
                        }`}
                      >
                        <div className="text-sm font-bold">
                          {patient.todayTempCelsius.toFixed(1)}°C
                        </div>
                        <div className="text-[10px] font-semibold">
                          {patient.todayHasFever ? 'Fever' : 'No Fever'}
                        </div>
                      </div>
                    ) : (
                      <span className="px-2.5 py-1 rounded-xl bg-amber-50 text-amber-900 border border-amber-200 text-xs font-bold shrink-0">
                        No Temp
                      </span>
                    )}
                  </div>

                  {/* 3-Day No-Fever Progress Dots */}
                  <NoFeverProgressDots noFeverDays={patient.noFeverDays} />
                </div>

                {/* Bottom Action Area: Big Primary Action Button (min-h-[44px]) */}
                <div className="space-y-2">
                  {patient.approvedForDischarge ? (
                    <button
                      type="button"
                      disabled
                      className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-emerald-100 text-emerald-900 font-bold text-xs sm:text-sm border border-emerald-300 cursor-not-allowed"
                    >
                      ✓ Approved for Discharge
                    </button>
                  ) : canApproveDischarge ? (
                    <div className="flex flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleQuickApproveDischarge(patient)}
                        className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm cursor-pointer transition-colors"
                      >
                        ✓ Approve Discharge (3/3 Fever-Free Days)
                      </button>
                      <button
                        type="button"
                        onClick={() => openConsultModal(patient)}
                        className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs cursor-pointer"
                      >
                        + Log Visit &amp; Custom Treatment Note
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={() => openConsultModal(patient)}
                        className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm cursor-pointer transition-colors"
                      >
                        + Log Visit &amp; Treatment
                      </button>
                      <button
                        type="button"
                        disabled
                        className="w-full min-h-[36px] px-3 py-1 rounded-xl bg-slate-100 text-slate-400 font-semibold text-[11px] border border-slate-200 cursor-not-allowed truncate"
                        title="Strictly disabled until patient completes 3 consecutive fever-free days (< 37.5°C)"
                      >
                        Discharge Locked ({patient.noFeverDays}/3 Fever-Free Days)
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Modal 1: Log Doctor Visit & Treatment Modal */}
      {consultPatient && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="doctor-consult-modal-title"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setConsultPatient(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 border border-slate-200 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="inline-block px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-bold font-tabular">
                  Room {consultPatient.roomId} • Bed #{consultPatient.bedNumber}
                </span>
                <h2 id="doctor-consult-modal-title" className="text-lg sm:text-xl font-bold text-slate-900 mt-1">
                  Doctor Visit — {consultPatient.fullName}, {consultPatient.age}y
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setConsultPatient(null)}
                className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Esc
              </button>
            </div>

            <form
              onSubmit={(e) => handleConsultSubmit(e, pendingCriticalConfirm)}
              className="space-y-4"
            >
              {/* Combined Temperature Input if Nurse hasn't recorded today's temp */}
              {!consultPatient.tempRecordedToday && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 space-y-2">
                  <p className="text-xs font-bold text-amber-950">
                    Nurse has not logged today&apos;s temperature yet. Enter temperature below to log both together:
                  </p>
                  <div className="flex items-center gap-2">
                    <label htmlFor="doctor-override-temp" className="text-xs font-bold text-slate-800">
                      Today&apos;s Temp (°C):
                    </label>
                    <input
                      id="doctor-override-temp"
                      type="number"
                      step="0.1"
                      value={overrideTemp}
                      onChange={(e) => {
                        setOverrideTemp(e.target.value);
                        setConsultError(null);
                        setPendingCriticalConfirm(false);
                      }}
                      className="w-28 min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-bold font-tabular text-sm"
                      required
                    />
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="doctor-treatment-input"
                  className="block text-sm font-bold text-slate-800 mb-1"
                >
                  Treatment &amp; Medication Note
                </label>
                <textarea
                  id="doctor-treatment-input"
                  rows={3}
                  value={treatmentNote}
                  onChange={(e) => setTreatmentNote(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-slate-800">
                    Approve Patient for Discharge?
                  </div>
                  <div className="text-xs text-slate-500">
                    Requires 3/3 consecutive fever-free days (&lt; 37.5°C).
                  </div>
                </div>
                <input
                  type="checkbox"
                  aria-label="Approve for Discharge"
                  checked={alsoApproveDischarge}
                  disabled={
                    consultPatient.tempRecordedToday &&
                    (consultPatient.noFeverDays < REQUIRED_NO_FEVER_DAYS ||
                      Boolean(consultPatient.todayHasFever))
                  }
                  onChange={(e) => setAlsoApproveDischarge(e.target.checked)}
                  className="w-5 h-5 accent-emerald-600"
                />
              </div>

              {consultError && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-red-50 border border-red-300 text-red-900 text-xs font-semibold space-y-2"
                >
                  <p>{consultError}</p>
                  {pendingCriticalConfirm && (
                    <button
                      type="button"
                      onClick={(e) => handleConsultSubmit(e as unknown as React.FormEvent, true)}
                      className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-red-600 text-white font-bold text-xs cursor-pointer"
                    >
                      Confirm Critical Temperature &amp; Save Visit
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConsultPatient(null)}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold cursor-pointer"
                >
                  Save Visit &amp; Treatment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Record Patient Mortality Outcome */}
      {mortalityPatient && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="mortality-modal-title"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setMortalityPatient(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 border border-slate-200 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <span className="inline-block px-2.5 py-0.5 rounded-md bg-red-100 text-red-800 text-xs font-bold font-tabular">
                Room {mortalityPatient.roomId} • Bed #{mortalityPatient.bedNumber}
              </span>
              <h2 id="mortality-modal-title" className="text-lg sm:text-xl font-bold text-slate-900 mt-1">
                Record Mortality — {mortalityPatient.fullName}
              </h2>
              <p className="text-xs text-slate-600 mt-1">
                This frees Bed #{mortalityPatient.bedNumber} and updates the live 85% Cure Rate / 15% Mortality Benchmark.
              </p>
            </div>

            <form onSubmit={handleConfirmMortality} className="space-y-4">
              <div>
                <label
                  htmlFor="mortality-cause-input"
                  className="block text-sm font-bold text-slate-800 mb-1"
                >
                  Clinical Cause Summary Note
                </label>
                <input
                  id="mortality-cause-input"
                  type="text"
                  placeholder="e.g. Severe viral febrile complications"
                  value={mortalityCause}
                  onChange={(e) => setMortalityCause(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm text-slate-900"
                  required
                />
              </div>

              {mortalityError && (
                <p role="alert" className="text-xs text-red-600 font-semibold">
                  {mortalityError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMortalityPatient(null)}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold cursor-pointer"
                >
                  Confirm Mortality &amp; Free Bed
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
