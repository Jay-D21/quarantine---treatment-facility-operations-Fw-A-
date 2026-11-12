import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resetFacilityDatabase,
  getFacilityMetrics,
  recordDailyTemperature,
  editTodayTemperature,
  recordDoctorVisit,
  approvePatientForDischarge,
  dischargeApprovedPatient,
  admitNewPatient,
  recordPatientMortality,
  simulateNextDayRollover,
  authenticateStaffCredentials,
} from './controllers';

test('Initial seed state strictly enforces 74/74 occupancy with authentic Indian names and 0 fake outcomes', () => {
  const state = resetFacilityDatabase();
  const metrics = getFacilityMetrics(state);

  assert.equal(state.rooms.length, 10);
  const totalRoomCapacity = state.rooms.reduce((acc, r) => acc + r.capacity, 0);
  assert.equal(totalRoomCapacity, 74);
  assert.equal(metrics.activeOccupancy, 74);
  assert.equal(metrics.availableBeds, 0);
  assert.equal(metrics.curedDischargedCount, 0);
  assert.equal(metrics.deceasedCount, 0);
  assert.equal(state.patients[0].fullName, 'Aarav Joshi');
  assert.equal(state.patients[9].fullName, 'Ramesh Kulkarni');
  assert.equal(metrics.tempsPendingTodayCount, 20); // Group A (Beds 1-20)
  assert.equal(metrics.readyForDoctorVisitCount, 28); // Group B (Beds 21-48)
  assert.equal(metrics.pendingDischargeCount, 6); // Group D (Beds 69-74)
});

test('Staff login authentication validates Nurse, Doctor, and Admin credentials', () => {
  const nurseLogin = authenticateStaffCredentials('nurse@facility.in', 'nurse123');
  assert.equal(nurseLogin.ok, true);
  assert.equal(nurseLogin.data?.staffName, 'Sister Sunita Deshmukh');

  const doctorLogin = authenticateStaffCredentials('doctor@facility.in', 'doctor123');
  assert.equal(doctorLogin.ok, true);
  assert.equal(doctorLogin.data?.staffName, 'Dr. Mohan Bhargava');

  const adminLogin = authenticateStaffCredentials('admin@facility.in', 'admin123');
  assert.equal(adminLogin.ok, true);
  assert.equal(adminLogin.data?.staffName, 'Rajesh Sharma');

  const badLogin = authenticateStaffCredentials('admin@facility.in', 'wrongpass');
  assert.equal(badLogin.ok, false);
});

test('Two-tier physiological survival validation blocks < 13.7°C or > 46.7°C and warns on critical survival temperatures', () => {
  resetFacilityDatabase();

  // Tier 1 Hard Block (< 13.7°C or > 46.7°C, e.g., typing 368 instead of 36.8)
  const lowHardBlock = recordDailyTemperature({ patientId: 'PT-1001', celsiusInput: 12.4 });
  assert.equal(lowHardBlock.ok, false);
  assert.equal(lowHardBlock.code, 'OUT_OF_PHYSIOLOGICAL_BOUNDS');

  const typoHardBlock = recordDailyTemperature({ patientId: 'PT-1001', celsiusInput: 368 });
  assert.equal(typoHardBlock.ok, false);
  assert.equal(typoHardBlock.code, 'OUT_OF_PHYSIOLOGICAL_BOUNDS');

  // Tier 2 Critical Survival Warning (13.7°C - 35.0°C or 42.0°C - 46.7°C) requires confirmation
  const unconfirmedCritical = recordDailyTemperature({ patientId: 'PT-1015', celsiusInput: 42.6 });
  assert.equal(unconfirmedCritical.ok, false);
  assert.equal(unconfirmedCritical.code, 'CRITICAL_SURVIVAL_WARNING_CONFIRM_REQUIRED');
  assert.equal(unconfirmedCritical.requiresConfirmation, true);

  // Confirmed critical reading saves and flags patient as CRITICAL EMERGENCY
  const confirmedCritical = recordDailyTemperature({
    patientId: 'PT-1015',
    celsiusInput: 42.6,
    confirmCriticalWarning: true,
  });
  assert.equal(confirmedCritical.ok, true);
  assert.equal(confirmedCritical.data?.isCriticalEmergency, true);
  assert.equal(confirmedCritical.data?.noFeverDays, 0);

  // Valid normal reading (< 37.5°C) on PT-1001 (who starts with 2/3 fever-free days)
  const validRes = recordDailyTemperature({ patientId: 'PT-1001', celsiusInput: 36.8 });
  assert.equal(validRes.ok, true);
  assert.equal(validRes.data?.noFeverDays, 3);
  assert.equal(validRes.data?.tempRecordedToday, true);

  // Duplicate daily measurement is strictly blocked
  const dupRes = recordDailyTemperature({ patientId: 'PT-1001', celsiusInput: 37.0 });
  assert.equal(dupRes.ok, false);
  assert.equal(dupRes.code, 'DUPLICATE_DAILY_MEASUREMENT');

  // Audited edit ("Correct typo") requires reason and recalculates streak accurately
  const feverEdit = editTodayTemperature({
    patientId: 'PT-1001',
    newCelsiusInput: 38.2,
    editReason: 'Recalibrated digital thermometer',
  });
  assert.equal(feverEdit.ok, true);
  assert.equal(feverEdit.data?.noFeverDays, 0);
  assert.equal(feverEdit.data?.todayHasFever, true);
});

test('Doctor visit, discharge approval, Admin capacity lock at 74/74, and 85% benchmark work end-to-end', () => {
  resetFacilityDatabase();

  // PT-1030 in Group B has < 3 fever-free days -> cannot be approved for discharge
  const blockedApprove = approvePatientForDischarge({ patientId: 'PT-1030' });
  assert.equal(blockedApprove.ok, false);
  assert.equal(blockedApprove.code, 'DISCHARGE_CRITERION_NOT_MET');

  // PT-1021 in Group B has 3/3 fever-free days -> can be approved for discharge
  const validApprove = approvePatientForDischarge({ patientId: 'PT-1021' });
  assert.equal(validApprove.ok, true);
  assert.equal(validApprove.data?.approvedForDischarge, true);

  // Doctor override for Group A patient (PT-1002) whose temp is not yet recorded today
  const withOverride = recordDoctorVisit({
    patientId: 'PT-1002',
    treatmentNotes: 'Combined temp check and antiviral review',
    overrideCelsiusInput: 36.7,
    approveForDischarge: true,
  });
  assert.equal(withOverride.ok, true);
  assert.equal(withOverride.data?.noFeverDays, 3);
  assert.equal(withOverride.data?.approvedForDischarge, true);

  // Admitting at 74/74 is strictly blocked
  const blockedAdmit = admitNewPatient({
    fullName: 'Vikram Sethi',
    ageInput: 41,
    roomId: 10,
  });
  assert.equal(blockedAdmit.ok, false);
  assert.equal(blockedAdmit.code, 'FACILITY_AT_MAX_CAPACITY');

  // Discharge PT-1069 (Group D, in Room 10, approved for discharge)
  const dischargeRes = dischargeApprovedPatient({ patientId: 'PT-1069' });
  assert.equal(dischargeRes.ok, true);

  let metrics = getFacilityMetrics();
  assert.equal(metrics.activeOccupancy, 73);
  assert.equal(metrics.availableBeds, 1);

  // Admit a new waiting patient into Room 10
  const admitRes = admitNewPatient({
    fullName: 'Kiran Deshmukh',
    ageInput: 39,
    roomId: 10,
  });
  assert.equal(admitRes.ok, true);
  assert.equal(admitRes.data?.bedNumber, 69);

  // Record a mortality outcome -> 1 cured, 1 deceased = 50% mortality (> 15% benchmark)
  const mortRes = recordPatientMortality({
    patientId: 'PT-1040',
    clinicalCauseNote: 'Acute respiratory failure despite intensive care',
  });
  assert.equal(mortRes.ok, true);

  metrics = getFacilityMetrics();
  assert.equal(metrics.isMortalityAboveThreshold, true);

  const rollover = simulateNextDayRollover();
  assert.equal(rollover.ok, true);
});
