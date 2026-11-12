import React, { useState } from 'react';
import {
  PatientRecord,
  FacilityOutcomeRecord,
} from '../backend/database';
import {
  FacilityMetricsSummary,
  RoomOccupancySummary,
  dischargeApprovedPatient,
  admitNewPatient,
  MAX_FACILITY_CAPACITY,
} from '../backend/controllers';
import {
  NoFeverProgressDots,
  getPlainPatientStatus,
} from './PatientCardParts';

interface AdminViewProps {
  patients: PatientRecord[];
  roomSummaries: RoomOccupancySummary[];
  outcomes: FacilityOutcomeRecord[];
  metrics: FacilityMetricsSummary;
  staffName: string;
  onSelectJournal: (patientId: string) => void;
}

export const AdminView: React.FC<AdminViewProps> = ({
  patients,
  roomSummaries,
  outcomes,
  metrics,
  staffName,
  onSelectJournal,
}) => {
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientAge, setNewPatientAge] = useState('42');
  const [selectedRoomId, setSelectedRoomId] = useState<number>(() => {
    const firstOpen = roomSummaries.find((r) => r.availableSlots.length > 0);
    return firstOpen ? firstOpen.id : 10;
  });
  const [newPatientNotes, setNewPatientNotes] = useState(
    'Admitted from waiting queue into viral isolation room.'
  );
  const [admitError, setAdmitError] = useState<string | null>(null);
  const [adminBanner, setAdminBanner] = useState<string | null>(null);

  const pendingDischargePatients = patients.filter(
    (p) => p.status === 'ACTIVE' && p.approvedForDischarge
  );

  const isAtMaxCapacity = metrics.activeOccupancy >= MAX_FACILITY_CAPACITY;

  const handleDischargeCheckout = (patient: PatientRecord) => {
    const res = dischargeApprovedPatient({
      patientId: patient.id,
      adminName: staffName,
    });

    if (!res.ok || !res.data) {
      setAdminBanner(res.error || 'Could not discharge patient.');
      return;
    }

    setSelectedRoomId(patient.roomId);
    setAdmitError(null);
    setAdminBanner(
      `✓ Discharged cured patient ${res.data.patientName} (Room ${res.data.roomId} • Bed #${res.data.bedNumber}). Bed is now free (${metrics.activeOccupancy - 1}/74 occupied)!`
    );
  };

  const handleAdmitSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAdmitError(null);

    const res = admitNewPatient({
      fullName: newPatientName,
      ageInput: newPatientAge,
      roomId: selectedRoomId,
      admittedNotes: newPatientNotes,
    });

    if (!res.ok || !res.data) {
      setAdmitError(res.error || 'Admission blocked.');
      return;
    }

    setNewPatientName('');
    setAdminBanner(
      `✓ Admitted ${res.data.fullName} (${res.data.age}y) into Room ${res.data.roomId} • Bed #${res.data.bedNumber}. Queued for today's Nurse Check.`
    );
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 space-y-5 overflow-x-hidden">
      {/* Live Feedback Toast Banner */}
      <div aria-live="polite">
        {adminBanner && (
          <div className="rounded-2xl p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-center justify-between gap-3">
            <p className="text-xs sm:text-sm font-semibold">{adminBanner}</p>
            <button
              type="button"
              onClick={() => setAdminBanner(null)}
              className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-semibold cursor-pointer shrink-0"
            >
              Close
            </button>
          </div>
        )}
      </div>

      {/* Section 1: Doctor-Approved Patients Ready for Discharge (Responsive Card Grid) */}
      <section className="space-y-3.5">
        <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900">
              Admin &amp; Beds — Ready for Discharge ({pendingDischargePatients.length})
            </h1>
            <p className="text-xs text-slate-600 mt-0.5">
              Patients below completed 3/3 fever-free days (&lt; 37.5°C) and were approved for discharge. Tap <strong>✓ Discharge &amp; Free Bed</strong> to open their room spot.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 font-tabular text-xs font-bold">
            <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200">
              Cured: {metrics.curedDischargedCount}
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-red-50 text-red-900 border border-red-200">
              Deceased: {metrics.deceasedCount}
            </span>
          </div>
        </div>

        {pendingDischargePatients.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <h2 className="text-base font-bold text-slate-900">
              No patients waiting in the Discharge Queue right now
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              All currently approved patients have been discharged. New discharge approvals will appear here automatically.
            </p>
          </div>
        ) : (
          <div
            aria-label="Pending Discharge Patient Cards"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4"
          >
            {pendingDischargePatients.map((patient) => {
              const statusInfo = getPlainPatientStatus(patient);
              return (
                <article
                  key={patient.id}
                  className="bg-white rounded-2xl border border-emerald-300 p-5 flex flex-col justify-between gap-4 shadow-2xs"
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 text-xs font-bold font-tabular">
                        Room {patient.roomId} • Bed #{patient.bedNumber}
                      </span>
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-bold border ${statusInfo.pillClass}`}
                      >
                        {statusInfo.label}
                      </span>
                    </div>

                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900">
                          {patient.fullName}, {patient.age}y
                        </h2>
                        <p className="text-xs text-slate-500 font-tabular mt-0.5">
                          {patient.id} •{' '}
                          <button
                            type="button"
                            onClick={() => onSelectJournal(patient.id)}
                            className="text-blue-600 hover:underline font-semibold cursor-pointer bg-transparent border-none p-0"
                          >
                            View Journal
                          </button>
                        </p>
                      </div>
                      <span className="px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200 text-xs font-bold font-tabular">
                        {patient.todayTempCelsius?.toFixed(1)}°C
                      </span>
                    </div>

                    <NoFeverProgressDots noFeverDays={patient.noFeverDays} />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDischargeCheckout(patient)}
                    className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm cursor-pointer transition-colors"
                  >
                    ✓ Discharge &amp; Free Bed #{patient.bedNumber}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Section 2: Admit New Patient + Rooms 1-10 Bed Availability */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 5 Cols: Admit New Waiting Patient Card */}
        <section className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-2xs space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Admit New Waiting Patient
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
              Facility limit: 74 beds total across Rooms 1 to 10 ({metrics.activeOccupancy}/74 occupied).
            </p>
          </div>

          {isAtMaxCapacity && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs font-semibold"
            >
              All 74/74 beds are currently occupied. Tap <strong>✓ Discharge &amp; Free Bed</strong> on an approved patient above to open a bed first.
            </div>
          )}

          <form onSubmit={handleAdmitSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="admit-patient-name"
                className="block text-sm font-bold text-slate-800 mb-1"
              >
                Patient Full Name
              </label>
              <input
                id="admit-patient-name"
                type="text"
                placeholder="e.g. Suresh Raina"
                value={newPatientName}
                onChange={(e) => setNewPatientName(e.target.value)}
                disabled={isAtMaxCapacity}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 disabled:bg-slate-100 disabled:opacity-60"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="admit-patient-age"
                  className="block text-sm font-bold text-slate-800 mb-1"
                >
                  Age (Years)
                </label>
                <input
                  id="admit-patient-age"
                  type="number"
                  min={1}
                  max={120}
                  value={newPatientAge}
                  onChange={(e) => setNewPatientAge(e.target.value)}
                  disabled={isAtMaxCapacity}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm font-tabular text-slate-900 disabled:bg-slate-100 disabled:opacity-60"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="admit-room-select"
                  className="block text-sm font-bold text-slate-800 mb-1"
                >
                  Select Room
                </label>
                <select
                  id="admit-room-select"
                  value={selectedRoomId}
                  onChange={(e) => setSelectedRoomId(Number(e.target.value))}
                  disabled={isAtMaxCapacity}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 disabled:bg-slate-100 disabled:opacity-60"
                >
                  {roomSummaries.map((room) => (
                    <option
                      key={room.id}
                      value={room.id}
                      disabled={room.availableSlots.length === 0}
                    >
                      {room.name} ({room.occupiedCount}/{room.capacity})
                      {room.availableSlots.length > 0
                        ? ` • ${room.availableSlots.length} Open`
                        : ' • Full'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="admit-notes-input"
                className="block text-sm font-bold text-slate-800 mb-1"
              >
                Admission Note
              </label>
              <input
                id="admit-notes-input"
                type="text"
                value={newPatientNotes}
                onChange={(e) => setNewPatientNotes(e.target.value)}
                disabled={isAtMaxCapacity}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 disabled:bg-slate-100 disabled:opacity-60"
              />
            </div>

            {admitError && (
              <p role="alert" className="text-xs font-semibold text-red-600">
                {admitError}
              </p>
            )}

            <button
              type="submit"
              disabled={isAtMaxCapacity}
              className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm cursor-pointer disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
            >
              {isAtMaxCapacity
                ? 'Admit New Patient (Locked at 74/74 Beds)'
                : '+ Admit New Patient into Open Bed'}
            </button>
          </form>
        </section>

        {/* Right 7 Cols: Rooms 1 to 10 Live Bed Status + Benchmark Outcomes */}
        <section className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-2xs space-y-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Rooms 1 to 10 Bed Occupancy (74 Total Beds)
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Rooms 1–4 have 8 beds each; Rooms 5–10 have 7 beds each.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mt-3">
              {roomSummaries.map((room) => {
                const hasOpen = room.availableBedNumbers.length > 0;
                return (
                  <div
                    key={room.id}
                    className={`rounded-xl border p-3 ${
                      hasOpen
                        ? 'bg-emerald-50/60 border-emerald-300'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">
                        {room.name}
                      </span>
                      <span className="text-xs font-bold font-tabular text-blue-700">
                        {room.occupiedCount}/{room.capacity}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 mt-1 font-tabular">
                      {hasOpen
                        ? `Open: ${room.availableBedNumbers.map((b) => `#${b.bedNumber}`).join(', ')}`
                        : 'Full'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200">
            <h3 className="text-sm font-bold text-slate-900">
              Recent Discharges &amp; Outcomes ({outcomes.length})
            </h3>
            {outcomes.length === 0 ? (
              <p className="text-xs text-slate-500 mt-1">
                No resolved outcomes yet. Discharge an approved patient above to record the first cured outcome.
              </p>
            ) : (
              <div className="mt-2 space-y-2 max-h-56 overflow-y-auto">
                {outcomes.map((o) => (
                  <div
                    key={o.id}
                    className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <span
                        className={`font-bold ${
                          o.outcomeType === 'CURED_DISCHARGED'
                            ? 'text-emerald-700'
                            : 'text-red-700'
                        }`}
                      >
                        {o.outcomeType === 'CURED_DISCHARGED' ? '✓ Cured' : 'Mortality'}
                      </span>{' '}
                      • <strong>{o.patientName}</strong> (Room {o.roomId} • Bed #{o.bedNumber})
                    </div>
                    <span className="text-slate-500 font-tabular shrink-0">
                      Day {o.facilityDay}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
