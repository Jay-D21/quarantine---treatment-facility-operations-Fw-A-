# Facility Operational Requirements (`context/facility_requirements.md`)

## 1. Facility Capacity & Ward Allocation
- **Maximum Capacity**: Strictly **74 patients** across **10 Ward Rooms** (`Ward Room 1` to `Ward Room 10`).
- **Bed Distribution**:
  - `Ward Room 1` to `Ward Room 4` (North Isolation Wing): **8 beds per room** (32 beds total, Beds 1–32).
  - `Ward Room 5` to `Ward Room 10` (South Treatment Wing): **7 beds per room** (42 beds total, Beds 33–74).
- **Initial Occupancy**: The facility starts at full occupancy (`74 / 74 active patients`). New waiting patients cannot be admitted until an existing bed is freed via cured discharge or recorded mortality.

## 2. Viral Pathology & Clinical Benchmark
- **Primary Symptom**: Prolonged fever, clinically defined as a body temperature **>= 37.5°C**.
- **Normal Temperature**: Any physiological reading strictly **< 37.5°C** (`34.0°C` to `37.4°C`).
- **Expected Mortality / Success Benchmark**:
  - **Expected Mortality Rate**: `15.0%` maximum threshold.
  - **Target Treatment Success Rate**: `85.0%` minimum benchmark.
  - **Zero Fake Historical Data**: Because the facility previously lacked a digital outcomes tracking system, historical cured and mortality counters start at `0` on initialization and update exclusively from real actions taken in the system.
  - **Benchmark Alerting**: If live mortality (`deceased / (cured + deceased)`) exceeds `15.0%`, Admin Staff immediately see a high-priority clinical quality warning banner.

## 3. Cure & Discharge Criterion
- A patient is clinically cured **solely** once they have recorded **3 full consecutive days without a fever (`< 37.5°C`)**.
- Any fever reading (`>= 37.5°C`) immediately resets the patient's consecutive fever-free day counter (`noFeverDays`) back to `0`.

## 4. Mandatory Daily Workflow Sequence Per Patient
1. **Step 1 — Nurse Daily Thermometry (`/nurse`)**:
   - A nurse measures and logs each active patient's temperature once per day.
   - Logging `< 37.5°C` increments `noFeverDays` by `+1`. Logging `>= 37.5°C` resets `noFeverDays` to `0`.
   - Duplicate daily measurements are blocked; corrections require an audited edit with a mandatory clinical reason.
2. **Step 2 — Doctor Consultation & Treatment Logging (`/doctor`)**:
   - Doctors visit patients **on the same day AFTER** the nurse has logged their daily temperature.
   - The default Doctor Queue displays only patients with `tempRecordedToday === true` and `doctorVisitedToday === false`, eliminating wasted room visits.
   - If a doctor searches for a patient whose temperature is not yet logged today, a prominent warning banner is shown alongside a combined **"Record Temp + Log Treatment"** override.
   - The doctor reviews the patient's temperature journal, logs the daily treatment regimen, and—strictly if `noFeverDays >= 3`—approves the patient for discharge.
3. **Step 3 — Admin Discharge & Capacity Management (`/admin`)**:
   - Admin staff receive immediate alerts in the **Pending Discharge Queue** when a doctor approves a patient.
   - Discharging an approved patient increments the cured counter, records a `CURED_DISCHARGED` facility outcome, and frees their room and bed slot.
   - Once occupancy is `< 74`, Admin can admit waiting patients into open room slots.

## 5. Initial 74-Patient Seed Cohorts (Immediate Testability)
- **Group A (Beds 1 to 20)**: Waiting for today's Nurse temperature check (`tempRecordedToday = false`). Beds 1–8 already have `2/3` consecutive fever-free days so logging a normal temperature (`< 37.5°C`) immediately transitions them to `3/3` fever-free days and places them in the Doctor's Ready Queue as discharge-eligible.
- **Group B (Beds 21 to 48)**: Today's temperature is already logged by a nurse (`tempRecordedToday = true`, `doctorVisitedToday = false`). Mix of normal (`< 37.5°C`) and febrile (`>= 37.5°C`) readings. Beds 21–28 are at `3/3` consecutive fever-free days so the Doctor can immediately test **"Approve for Discharge"**.
- **Group C (Beds 49 to 68)**: Both today's Nurse temperature check and Doctor consultation are completed (`tempRecordedToday = true`, `doctorVisitedToday = true`).
- **Group D (Beds 69 to 74)**: Have completed `3/3` consecutive fever-free days, completed today's nurse and doctor workflow, and are approved for discharge (`approvedForDischarge = true`). They sit in the Admin **Pending Discharge Queue** for immediate one-click checkout.
