/**
 * Clinical Operations Controllers & Domain Validation (src/backend/controllers.ts)
 * Enforces Two-Tier Physiological Temperature Validation (based on human survival limits):
 *  - Hard Block (< 13.7°C or > 46.7°C): Immediate typing error block
 *  - Critical Survival Warning (13.7°C - 35.0°C or 42.0°C - 46.7°C): Requires confirmation & flags CRITICAL EMERGENCY
 *  - Fever Cutoff (>= 37.5°C): < 37.5°C increments 3-day cure counter; >= 37.5°C resets to 0
 */

import {
  db,
  PatientRecord,
  RoomRecord,
  TemperatureLogRecord,
  DoctorVisitRecord,
  FacilityOutcomeRecord,
  RelationalDatabaseSchema,
} from './database';

export const SURVIVAL_MIN_TEMP_C = 13.7;
export const SURVIVAL_MAX_TEMP_C = 46.7;
export const CRITICAL_LOW_WARNING_C = 35.0;
export const CRITICAL_HIGH_WARNING_C = 42.0;
export const LETHAL_HYPOTHERMIA_REF_C = 24.0;
export const FEVER_THRESHOLD_C = 37.5;
export const REQUIRED_NO_FEVER_DAYS = 3;
export const MAX_FACILITY_CAPACITY = 74;
export const MORTALITY_ALERT_THRESHOLD_PCT = 15.0;
export const SUCCESS_BENCHMARK_PCT = 85.0;

// Backward-compatible aliases
export const MIN_VALID_TEMP_C = SURVIVAL_MIN_TEMP_C;
export const MAX_VALID_TEMP_C = SURVIVAL_MAX_TEMP_C;

export interface StaffAccount {
  role: 'NURSE' | 'DOCTOR' | 'ADMIN';
  email: string;
  password: string;
  staffName: string;
  title: string;
  route: '/nurse' | '/doctor' | '/admin';
}

export const STAFF_ACCOUNTS: StaffAccount[] = [
  {
    role: 'NURSE',
    email: 'nurse@facility.in',
    password: 'nurse123',
    staffName: 'Sister Sunita Deshmukh',
    title: 'Head Ward Nurse',
    route: '/nurse',
  },
  {
    role: 'DOCTOR',
    email: 'doctor@facility.in',
    password: 'doctor123',
    staffName: 'Dr. Mohan Bhargava',
    title: 'Senior Medical Officer',
    route: '/doctor',
  },
  {
    role: 'ADMIN',
    email: 'admin@facility.in',
    password: 'admin123',
    staffName: 'Rajesh Sharma',
    title: 'Facility & Bed Administrator',
    route: '/admin',
  },
];

export interface ControllerResult<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
  requiresConfirmation?: boolean;
  isCriticalEmergency?: boolean;
}

export interface TemperatureValidationDetails {
  celsius: number;
  hasFever: boolean;
  isCriticalEmergency: boolean;
  criticalWarningMessage: string | null;
}

export interface FacilityMetricsSummary {
  currentFacilityDay: number;
  activeOccupancy: number;
  maxCapacity: number;
  availableBeds: number;
  tempsRecordedTodayCount: number;
  tempsPendingTodayCount: number;
  readyForDoctorVisitCount: number;
  doctorVisitedTodayCount: number;
  pendingDischargeCount: number;
  criticalEmergencyCount: number;
  curedDischargedCount: number;
  deceasedCount: number;
  totalResolvedOutcomes: number;
  successRatePct: number | null; // null when 0 outcomes resolved yet
  mortalityRatePct: number | null;
  isMortalityAboveThreshold: boolean;
}

export interface RoomOccupancySummary extends RoomRecord {
  occupiedCount: number;
  availableSlots: number[];
  availableBedNumbers: { roomSlot: number; bedNumber: number }[];
  patients: PatientRecord[];
}

export function authenticateStaffCredentials(
  emailInput: string,
  passwordInput: string
): ControllerResult<StaffAccount> {
  const cleanEmail = emailInput.trim().toLowerCase();
  const cleanPass = passwordInput.trim();
  const matched = STAFF_ACCOUNTS.find(
    (acc) => acc.email.toLowerCase() === cleanEmail && acc.password === cleanPass
  );
  if (!matched) {
    return {
      ok: false,
      code: 'INVALID_CREDENTIALS',
      error: 'Invalid email or password. Use the displayed staff credentials or tap a 1-Click Auto-Login button below.',
    };
  }
  return { ok: true, data: matched };
}

/**
 * Two-Tier Physiological Temperature Validation (Based on Human Survival Limits):
 * 1. Hard Block (< 13.7°C or > 46.7°C): Immediate block as a typing error (e.g., 368 instead of 36.8).
 * 2. Critical Survival Warning (13.7°C - 35.0°C or 42.0°C - 46.7°C): Requires confirmation & flags CRITICAL EMERGENCY.
 */
export function validateTemperatureInput(
  rawInput: string | number
): ControllerResult<TemperatureValidationDetails> {
  const str = String(rawInput ?? '').trim();
  const num = typeof rawInput === 'number' ? rawInput : Number(str);
  if (!Number.isFinite(num) || str === '') {
    return {
      ok: false,
      code: 'INVALID_NUMBER',
      error: 'Please enter a valid temperature number in °C (for example, 36.8).',
    };
  }

  const rounded = Math.round(num * 10) / 10;

  // Tier 1: Hard Block (< 13.7°C or > 46.7°C)
  if (rounded < SURVIVAL_MIN_TEMP_C || rounded > SURVIVAL_MAX_TEMP_C) {
    return {
      ok: false,
      code: 'OUT_OF_PHYSIOLOGICAL_BOUNDS',
      error: `Typing error blocked (${rounded.toFixed(1)}°C): Temperature must be within human survival limits (${SURVIVAL_MIN_TEMP_C}°C to ${SURVIVAL_MAX_TEMP_C}°C). Did you miss a decimal point (e.g. 36.8°C)?`,
    };
  }

  const hasFever = rounded >= FEVER_THRESHOLD_C;
  const isCriticalLow = rounded <= CRITICAL_LOW_WARNING_C;
  const isCriticalHigh = rounded >= CRITICAL_HIGH_WARNING_C;
  const isCriticalEmergency = isCriticalLow || isCriticalHigh;

  let criticalWarningMessage: string | null = null;
  if (isCriticalEmergency) {
    const clinicalDetail =
      rounded < LETHAL_HYPOTHERMIA_REF_C
        ? `Extreme hypothermia (${rounded.toFixed(1)}°C < 24.0°C threshold)`
        : isCriticalLow
        ? `Severe hypothermia (${rounded.toFixed(1)}°C in 13.7°C–35.0°C range)`
        : `Extreme hyperpyrexia (${rounded.toFixed(1)}°C >= 42.0°C protein-denaturation threshold)`;

    criticalWarningMessage = `Critical life-threatening temperature entered (${clinicalDetail}). Please confirm this is not a typo. Confirming will flag this patient as CRITICAL EMERGENCY at the top of the Doctor's queue.`;
  }

  return {
    ok: true,
    data: {
      celsius: rounded,
      hasFever,
      isCriticalEmergency,
      criticalWarningMessage,
    },
  };
}

/**
 * Step 1: Nurse records a patient's daily temperature.
 * Enforces two-tier survival validation and blocks duplicate daily logs.
 */
export function recordDailyTemperature(params: {
  patientId: string;
  celsiusInput: string | number;
  nurseName?: string;
  confirmCriticalWarning?: boolean;
}): ControllerResult<PatientRecord> {
  const tempCheck = validateTemperatureInput(params.celsiusInput);
  if (!tempCheck.ok || !tempCheck.data) {
    return { ok: false, code: tempCheck.code, error: tempCheck.error };
  }

  const { celsius, hasFever, isCriticalEmergency, criticalWarningMessage } = tempCheck.data;

  // Tier 2: Require confirmation if in critical survival warning range
  if (isCriticalEmergency && !params.confirmCriticalWarning) {
    return {
      ok: false,
      code: 'CRITICAL_SURVIVAL_WARNING_CONFIRM_REQUIRED',
      requiresConfirmation: true,
      isCriticalEmergency: true,
      error:
        criticalWarningMessage ||
        'Critical life-threatening temperature entered. Please confirm this is not a typo.',
    };
  }

  return db.executeTransaction((state) => {
    const patient = state.patients.find((p) => p.id === params.patientId && p.status === 'ACTIVE');
    if (!patient) {
      return {
        ok: false,
        code: 'PATIENT_NOT_FOUND',
        error: `Active patient ${params.patientId} not found in facility registry.`,
      };
    }

    if (patient.tempRecordedToday) {
      return {
        ok: false,
        code: 'DUPLICATE_DAILY_MEASUREMENT',
        error: `Today's temperature for ${patient.fullName} is already recorded. Use "Correct typo" with a reason to edit.`,
      };
    }

    patient.streakBeforeToday = patient.noFeverDays;
    patient.noFeverDays = hasFever ? 0 : patient.noFeverDays + 1;
    patient.tempRecordedToday = true;
    patient.todayTempCelsius = celsius;
    patient.todayHasFever = hasFever;
    patient.isCriticalEmergency = isCriticalEmergency;

    if (hasFever || isCriticalEmergency) {
      patient.approvedForDischarge = false;
      patient.approvedByDoctorAt = null;
    }

    const newLog: TemperatureLogRecord = {
      id: `TLOG-${patient.id}-D${state.currentFacilityDay}-${Date.now()}`,
      patientId: patient.id,
      facilityDay: state.currentFacilityDay,
      recordedAt: new Date().toISOString(),
      celsius,
      hasFever,
      isCriticalEmergency,
      recordedByRole: 'NURSE',
      recordedByName: params.nurseName?.trim() || 'Sister Sunita Deshmukh',
      streakAfterLog: patient.noFeverDays,
      editReason: null,
    };

    state.temperature_logs.push(newLog);
    return { ok: true, data: { ...patient }, isCriticalEmergency };
  });
}

/**
 * Nurse Audited Edit ("Correct typo") for an already-recorded temperature today.
 * Requires a mandatory reason.
 */
export function editTodayTemperature(params: {
  patientId: string;
  newCelsiusInput: string | number;
  editReason: string;
  clinicianName?: string;
  confirmCriticalWarning?: boolean;
}): ControllerResult<PatientRecord> {
  const tempCheck = validateTemperatureInput(params.newCelsiusInput);
  if (!tempCheck.ok || !tempCheck.data) {
    return { ok: false, code: tempCheck.code, error: tempCheck.error };
  }

  const reasonTrimmed = params.editReason.trim();
  if (reasonTrimmed.length < 4) {
    return {
      ok: false,
      code: 'AUDIT_REASON_REQUIRED',
      error: 'Please enter a short reason for correcting today’s temperature (minimum 4 characters).',
    };
  }

  const { celsius, hasFever, isCriticalEmergency, criticalWarningMessage } = tempCheck.data;

  if (isCriticalEmergency && !params.confirmCriticalWarning) {
    return {
      ok: false,
      code: 'CRITICAL_SURVIVAL_WARNING_CONFIRM_REQUIRED',
      requiresConfirmation: true,
      isCriticalEmergency: true,
      error:
        criticalWarningMessage ||
        'Critical life-threatening temperature entered. Please confirm this is not a typo.',
    };
  }

  return db.executeTransaction((state) => {
    const patient = state.patients.find((p) => p.id === params.patientId && p.status === 'ACTIVE');
    if (!patient) {
      return {
        ok: false,
        code: 'PATIENT_NOT_FOUND',
        error: `Active patient ${params.patientId} not found.`,
      };
    }

    if (!patient.tempRecordedToday) {
      return {
        ok: false,
        code: 'NO_MEASUREMENT_TO_EDIT',
        error: 'Cannot edit before an initial daily temperature is recorded.',
      };
    }

    patient.noFeverDays = hasFever ? 0 : patient.streakBeforeToday + 1;
    patient.todayTempCelsius = celsius;
    patient.todayHasFever = hasFever;
    patient.isCriticalEmergency = isCriticalEmergency;

    if (hasFever || isCriticalEmergency || patient.noFeverDays < REQUIRED_NO_FEVER_DAYS) {
      patient.approvedForDischarge = false;
      patient.approvedByDoctorAt = null;
    }

    const existingLog = [...state.temperature_logs]
      .reverse()
      .find((log) => log.patientId === patient.id && log.facilityDay === state.currentFacilityDay);

    if (existingLog) {
      existingLog.celsius = celsius;
      existingLog.hasFever = hasFever;
      existingLog.isCriticalEmergency = isCriticalEmergency;
      existingLog.recordedAt = new Date().toISOString();
      existingLog.streakAfterLog = patient.noFeverDays;
      existingLog.editReason = reasonTrimmed;
      existingLog.recordedByName = params.clinicianName?.trim() || existingLog.recordedByName;
    }

    return { ok: true, data: { ...patient }, isCriticalEmergency };
  });
}

/**
 * Step 2: Doctor logs consultation & treatment notes.
 * If patient's temperature was not yet taken today, requires overrideCelsiusInput.
 * Can optionally approve for discharge ONLY if noFeverDays >= 3.
 */
export function recordDoctorVisit(params: {
  patientId: string;
  treatmentNotes: string;
  approveForDischarge?: boolean;
  overrideCelsiusInput?: string | number;
  doctorName?: string;
  confirmCriticalWarning?: boolean;
}): ControllerResult<PatientRecord> {
  const notesTrimmed = params.treatmentNotes.trim();
  if (notesTrimmed.length < 4) {
    return {
      ok: false,
      code: 'TREATMENT_NOTES_REQUIRED',
      error: 'Please enter treatment instructions (minimum 4 characters).',
    };
  }

  return db.executeTransaction((state) => {
    const patient = state.patients.find((p) => p.id === params.patientId && p.status === 'ACTIVE');
    if (!patient) {
      return {
        ok: false,
        code: 'PATIENT_NOT_FOUND',
        error: `Active patient ${params.patientId} not found.`,
      };
    }

    let usedOverride = false;

    if (!patient.tempRecordedToday) {
      if (params.overrideCelsiusInput === undefined || String(params.overrideCelsiusInput).trim() === '') {
        return {
          ok: false,
          code: 'NURSE_TEMP_MISSING',
          error: 'Temperature not yet recorded by nurse today. Please enter the patient’s temperature together with your treatment note.',
        };
      }
      const tempCheck = validateTemperatureInput(params.overrideCelsiusInput);
      if (!tempCheck.ok || !tempCheck.data) {
        return { ok: false, code: tempCheck.code, error: tempCheck.error };
      }

      const { celsius, hasFever, isCriticalEmergency, criticalWarningMessage } = tempCheck.data;
      if (isCriticalEmergency && !params.confirmCriticalWarning) {
        return {
          ok: false,
          code: 'CRITICAL_SURVIVAL_WARNING_CONFIRM_REQUIRED',
          requiresConfirmation: true,
          isCriticalEmergency: true,
          error:
            criticalWarningMessage ||
            'Critical life-threatening temperature entered. Please confirm this is not a typo.',
        };
      }

      patient.streakBeforeToday = patient.noFeverDays;
      patient.noFeverDays = hasFever ? 0 : patient.noFeverDays + 1;
      patient.tempRecordedToday = true;
      patient.todayTempCelsius = celsius;
      patient.todayHasFever = hasFever;
      patient.isCriticalEmergency = isCriticalEmergency;
      usedOverride = true;

      state.temperature_logs.push({
        id: `TLOG-${patient.id}-D${state.currentFacilityDay}-${Date.now()}`,
        patientId: patient.id,
        facilityDay: state.currentFacilityDay,
        recordedAt: new Date().toISOString(),
        celsius,
        hasFever,
        isCriticalEmergency,
        recordedByRole: 'DOCTOR_OVERRIDE',
        recordedByName: params.doctorName?.trim() || 'Dr. Mohan Bhargava',
        streakAfterLog: patient.noFeverDays,
        editReason: null,
      });
    }

    if (params.approveForDischarge) {
      if (patient.noFeverDays < REQUIRED_NO_FEVER_DAYS || patient.todayHasFever || patient.isCriticalEmergency) {
        return {
          ok: false,
          code: 'DISCHARGE_CRITERION_NOT_MET',
          error: `Discharge approval blocked: Patient has ${patient.noFeverDays}/${REQUIRED_NO_FEVER_DAYS} consecutive fever-free days (< 37.5°C). Requires 3 full consecutive fever-free days.`,
        };
      }
      patient.approvedForDischarge = true;
      patient.approvedByDoctorAt = new Date().toISOString();
    }

    patient.doctorVisitedToday = true;

    const visitRecord: DoctorVisitRecord = {
      id: `DVIS-${patient.id}-D${state.currentFacilityDay}-${Date.now()}`,
      patientId: patient.id,
      facilityDay: state.currentFacilityDay,
      visitedAt: new Date().toISOString(),
      doctorName: params.doctorName?.trim() || 'Dr. Mohan Bhargava',
      treatmentNotes: notesTrimmed,
      tempReviewedCelsius: patient.todayTempCelsius ?? 36.8,
      noFeverDaysAtVisit: patient.noFeverDays,
      recommendedDischarge: Boolean(params.approveForDischarge),
      usedNurseOverride: usedOverride,
    };

    state.doctor_visits.push(visitRecord);
    return { ok: true, data: { ...patient } };
  });
}

/**
 * Direct Doctor "Approve Discharge" action for a patient who already has >= 3 fever-free days.
 */
export function approvePatientForDischarge(params: {
  patientId: string;
  doctorName?: string;
  clinicalNote?: string;
}): ControllerResult<PatientRecord> {
  return db.executeTransaction((state) => {
    const patient = state.patients.find((p) => p.id === params.patientId && p.status === 'ACTIVE');
    if (!patient) {
      return {
        ok: false,
        code: 'PATIENT_NOT_FOUND',
        error: `Active patient ${params.patientId} not found.`,
      };
    }

    if (!patient.tempRecordedToday) {
      return {
        ok: false,
        code: 'TEMP_REQUIRED_BEFORE_DISCHARGE',
        error: "Today's temperature must be recorded before approving discharge.",
      };
    }

    if (patient.noFeverDays < REQUIRED_NO_FEVER_DAYS || patient.todayHasFever || patient.isCriticalEmergency) {
      return {
        ok: false,
        code: 'DISCHARGE_CRITERION_NOT_MET',
        error: `Cannot approve discharge: ${patient.fullName} has ${patient.noFeverDays}/${REQUIRED_NO_FEVER_DAYS} consecutive fever-free days (< 37.5°C).`,
      };
    }

    patient.approvedForDischarge = true;
    patient.approvedByDoctorAt = new Date().toISOString();
    patient.doctorVisitedToday = true;

    state.doctor_visits.push({
      id: `DVIS-${patient.id}-D${state.currentFacilityDay}-${Date.now()}`,
      patientId: patient.id,
      facilityDay: state.currentFacilityDay,
      visitedAt: new Date().toISOString(),
      doctorName: params.doctorName?.trim() || 'Dr. Mohan Bhargava',
      treatmentNotes:
        params.clinicalNote?.trim() ||
        'Verified 3 consecutive fever-free days (< 37.5°C). Approved for immediate discharge.',
      tempReviewedCelsius: patient.todayTempCelsius ?? 36.7,
      noFeverDaysAtVisit: patient.noFeverDays,
      recommendedDischarge: true,
      usedNurseOverride: false,
    });

    return { ok: true, data: { ...patient } };
  });
}

/**
 * Doctor records a patient mortality outcome.
 * Updates the live 85% success / 15% mortality tracker and frees the bed slot.
 */
export function recordPatientMortality(params: {
  patientId: string;
  clinicalCauseNote: string;
  doctorName?: string;
}): ControllerResult<FacilityOutcomeRecord> {
  const noteTrimmed = params.clinicalCauseNote.trim();
  if (noteTrimmed.length < 4) {
    return {
      ok: false,
      code: 'MORTALITY_NOTE_REQUIRED',
      error: 'Please enter a short clinical summary note to record mortality.',
    };
  }

  return db.executeTransaction((state) => {
    const patient = state.patients.find((p) => p.id === params.patientId && p.status === 'ACTIVE');
    if (!patient) {
      return {
        ok: false,
        code: 'PATIENT_NOT_FOUND',
        error: `Active patient ${params.patientId} not found.`,
      };
    }

    patient.status = 'DECEASED';
    patient.approvedForDischarge = false;
    patient.isCriticalEmergency = false;

    const outcome: FacilityOutcomeRecord = {
      id: `OUT-${patient.id}-${Date.now()}`,
      patientId: patient.id,
      patientName: patient.fullName,
      roomId: patient.roomId,
      bedNumber: patient.bedNumber,
      outcomeType: 'MORTALITY',
      facilityDay: state.currentFacilityDay,
      recordedAt: new Date().toISOString(),
      authorizedBy: params.doctorName?.trim() || 'Dr. Mohan Bhargava',
      clinicalSummary: noteTrimmed,
    };

    state.facility_outcomes.unshift(outcome);
    return { ok: true, data: outcome };
  });
}

/**
 * Step 3: Admin discharges a doctor-approved patient.
 * Increments cured count and frees their spot in the room.
 */
export function dischargeApprovedPatient(params: {
  patientId: string;
  adminName?: string;
}): ControllerResult<FacilityOutcomeRecord> {
  return db.executeTransaction((state) => {
    const patient = state.patients.find((p) => p.id === params.patientId && p.status === 'ACTIVE');
    if (!patient) {
      return {
        ok: false,
        code: 'PATIENT_NOT_FOUND',
        error: `Active patient ${params.patientId} not found.`,
      };
    }

    if (!patient.approvedForDischarge || patient.noFeverDays < REQUIRED_NO_FEVER_DAYS) {
      return {
        ok: false,
        code: 'NOT_APPROVED_FOR_DISCHARGE',
        error: `${patient.fullName} has not been approved for discharge by a doctor or lacks 3 consecutive fever-free days.`,
      };
    }

    patient.status = 'DISCHARGED_CURED';

    const outcome: FacilityOutcomeRecord = {
      id: `OUT-${patient.id}-${Date.now()}`,
      patientId: patient.id,
      patientName: patient.fullName,
      roomId: patient.roomId,
      bedNumber: patient.bedNumber,
      outcomeType: 'CURED_DISCHARGED',
      facilityDay: state.currentFacilityDay,
      recordedAt: new Date().toISOString(),
      authorizedBy: params.adminName?.trim() || 'Rajesh Sharma',
      clinicalSummary: `Discharged cured after ${patient.noFeverDays} consecutive fever-free days (< 37.5°C). Room ${patient.roomId} • Bed #${patient.bedNumber} freed.`,
    };

    state.facility_outcomes.unshift(outcome);
    return { ok: true, data: outcome };
  });
}

/**
 * Step 3b: Admin admits a waiting patient into an available room spot.
 * Strictly blocked when active occupancy is 74/74.
 */
export function admitNewPatient(params: {
  fullName: string;
  ageInput: string | number;
  roomId: number;
  admittedNotes?: string;
}): ControllerResult<PatientRecord> {
  const cleanName = params.fullName.trim();
  if (cleanName.length < 2) {
    return {
      ok: false,
      code: 'INVALID_PATIENT_NAME',
      error: 'Please enter the patient’s full name.',
    };
  }

  const ageNum = typeof params.ageInput === 'number' ? params.ageInput : Number(String(params.ageInput).trim());
  if (!Number.isInteger(ageNum) || ageNum < 1 || ageNum > 120) {
    return {
      ok: false,
      code: 'INVALID_PATIENT_AGE',
      error: 'Patient age must be between 1 and 120 years.',
    };
  }

  return db.executeTransaction((state) => {
    const activePatients = state.patients.filter((p) => p.status === 'ACTIVE');
    if (activePatients.length >= MAX_FACILITY_CAPACITY) {
      return {
        ok: false,
        code: 'FACILITY_AT_MAX_CAPACITY',
        error: `All 74/74 beds are occupied. Discharge an approved patient first to free a bed.`,
      };
    }

    const room = state.rooms.find((r) => r.id === Number(params.roomId));
    if (!room) {
      return {
        ok: false,
        code: 'ROOM_NOT_FOUND',
        error: `Room ${params.roomId} does not exist.`,
      };
    }

    const occupiedInRoom = activePatients.filter((p) => p.roomId === room.id);
    if (occupiedInRoom.length >= room.capacity) {
      return {
        ok: false,
        code: 'ROOM_AT_MAX_CAPACITY',
        error: `${room.name} is full (${room.capacity}/${room.capacity} beds). Please select a room with an open bed.`,
      };
    }

    let targetRoomSlot = 1;
    for (let slot = 1; slot <= room.capacity; slot++) {
      if (!occupiedInRoom.some((p) => p.roomSlot === slot)) {
        targetRoomSlot = slot;
        break;
      }
    }

    const baseBedOffset = room.id <= 4
      ? (room.id - 1) * 8
      : 32 + (room.id - 5) * 7;
    const globalBedNumber = baseBedOffset + targetRoomSlot;

    const newPatientId = `PT-${state.nextPatientSequence}`;
    state.nextPatientSequence += 1;

    const newPatient: PatientRecord = {
      id: newPatientId,
      bedNumber: globalBedNumber,
      roomId: room.id,
      roomSlot: targetRoomSlot,
      fullName: cleanName,
      age: ageNum,
      admissionDay: state.currentFacilityDay,
      cohortGroup: 'ADMITTED',
      status: 'ACTIVE',
      noFeverDays: 0,
      streakBeforeToday: 0,
      tempRecordedToday: false,
      todayTempCelsius: null,
      todayHasFever: null,
      isCriticalEmergency: false,
      doctorVisitedToday: false,
      approvedForDischarge: false,
      approvedByDoctorAt: null,
      admittedNotes: params.admittedNotes?.trim() || 'Admitted from waiting list into isolation ward.',
    };

    state.patients.push(newPatient);
    state.patients.sort((a, b) => a.bedNumber - b.bedNumber);

    return { ok: true, data: { ...newPatient } };
  });
}

/**
 * Utility: Simulate Next Day Rollover (midnight rollover).
 */
export function simulateNextDayRollover(): ControllerResult<{ newDay: number }> {
  return db.executeTransaction((state) => {
    state.currentFacilityDay += 1;

    for (const patient of state.patients) {
      if (patient.status === 'ACTIVE') {
        patient.streakBeforeToday = patient.noFeverDays;
        patient.tempRecordedToday = false;
        patient.todayTempCelsius = null;
        patient.todayHasFever = null;
        patient.isCriticalEmergency = false;
        patient.doctorVisitedToday = false;
      }
    }

    return { ok: true, data: { newDay: state.currentFacilityDay } };
  });
}

/**
 * Utility: Reset Facility State (74/74)
 */
export function resetFacilityDatabase(): RelationalDatabaseSchema {
  return db.resetToInitialSeed();
}

/**
 * Compute live facility KPIs and 85% Success / 15% Mortality Benchmark metrics.
 */
export function getFacilityMetrics(state: RelationalDatabaseSchema = db.getState()): FacilityMetricsSummary {
  const activePatients = state.patients.filter((p) => p.status === 'ACTIVE');
  const activeOccupancy = activePatients.length;
  const availableBeds = Math.max(0, MAX_FACILITY_CAPACITY - activeOccupancy);

  const tempsRecordedTodayCount = activePatients.filter((p) => p.tempRecordedToday).length;
  const tempsPendingTodayCount = activePatients.filter((p) => !p.tempRecordedToday).length;

  const readyForDoctorVisitCount = activePatients.filter(
    (p) => p.tempRecordedToday && !p.doctorVisitedToday
  ).length;
  const doctorVisitedTodayCount = activePatients.filter((p) => p.doctorVisitedToday).length;
  const pendingDischargeCount = activePatients.filter((p) => p.approvedForDischarge).length;
  const criticalEmergencyCount = activePatients.filter((p) => p.isCriticalEmergency).length;

  const curedDischargedCount = state.facility_outcomes.filter(
    (o) => o.outcomeType === 'CURED_DISCHARGED'
  ).length;
  const deceasedCount = state.facility_outcomes.filter(
    (o) => o.outcomeType === 'MORTALITY'
  ).length;
  const totalResolvedOutcomes = curedDischargedCount + deceasedCount;

  let successRatePct: number | null = null;
  let mortalityRatePct: number | null = null;
  let isMortalityAboveThreshold = false;

  if (totalResolvedOutcomes > 0) {
    mortalityRatePct = Number(((deceasedCount / totalResolvedOutcomes) * 100).toFixed(1));
    successRatePct = Number(((curedDischargedCount / totalResolvedOutcomes) * 100).toFixed(1));
    isMortalityAboveThreshold = mortalityRatePct > MORTALITY_ALERT_THRESHOLD_PCT;
  }

  return {
    currentFacilityDay: state.currentFacilityDay,
    activeOccupancy,
    maxCapacity: MAX_FACILITY_CAPACITY,
    availableBeds,
    tempsRecordedTodayCount,
    tempsPendingTodayCount,
    readyForDoctorVisitCount,
    doctorVisitedTodayCount,
    pendingDischargeCount,
    criticalEmergencyCount,
    curedDischargedCount,
    deceasedCount,
    totalResolvedOutcomes,
    successRatePct,
    mortalityRatePct,
    isMortalityAboveThreshold,
  };
}

/**
 * Compute per-room occupancy and open bed slots across Rooms 1 to 10.
 */
export function getRoomOccupancySummaries(
  state: RelationalDatabaseSchema = db.getState()
): RoomOccupancySummary[] {
  const activePatients = state.patients.filter((p) => p.status === 'ACTIVE');

  return state.rooms.map((room) => {
    const roomPatients = activePatients
      .filter((p) => p.roomId === room.id)
      .sort((a, b) => a.roomSlot - b.roomSlot);

    const availableSlots: number[] = [];
    const availableBedNumbers: { roomSlot: number; bedNumber: number }[] = [];
    const baseBedOffset = room.id <= 4 ? (room.id - 1) * 8 : 32 + (room.id - 5) * 7;

    for (let slot = 1; slot <= room.capacity; slot++) {
      if (!roomPatients.some((p) => p.roomSlot === slot)) {
        availableSlots.push(slot);
        availableBedNumbers.push({
          roomSlot: slot,
          bedNumber: baseBedOffset + slot,
        });
      }
    }

    return {
      ...room,
      occupiedCount: roomPatients.length,
      availableSlots,
      availableBedNumbers,
      patients: roomPatients,
    };
  });
}

/**
 * Retrieve complete longitudinal journal for a specific patient.
 */
export function getPatientJournal(
  patientId: string,
  state: RelationalDatabaseSchema = db.getState()
): {
  patient: PatientRecord | undefined;
  temperatureLogs: TemperatureLogRecord[];
  doctorVisits: DoctorVisitRecord[];
} {
  const patient = state.patients.find((p) => p.id === patientId);
  const temperatureLogs = state.temperature_logs
    .filter((l) => l.patientId === patientId)
    .sort((a, b) => b.facilityDay - a.facilityDay);
  const doctorVisits = state.doctor_visits
    .filter((v) => v.patientId === patientId)
    .sort((a, b) => b.facilityDay - a.facilityDay);

  return { patient, temperatureLogs, doctorVisits };
}
