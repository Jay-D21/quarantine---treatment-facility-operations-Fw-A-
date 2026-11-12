# Quarantine & Treatment Facility Operations

A full-stack clinical operations and patient workflow management system for a **74-bed viral quarantine and treatment facility**, enforcing daily nurse thermometry, doctor treatment reviews, physiological safety bounds, and administrative capacity and outcome benchmarks.

---

## Core Clinical Workflow & Business Rules

### 1. Facility Capacity & Ward Allocation
- **Maximum Capacity:** Strictly **74 beds** across **10 ward rooms**:
  - **North Isolation Wing (`Ward Room 1–4`):** 8 beds per room (32 beds, Beds 1–32)
  - **South Treatment Wing (`Ward Room 5–10`):** 7 beds per room (42 beds, Beds 33–74)
- **Initial State:** Starts at `74 / 74` active occupancy with `0` historical cured/mortality counts so every metric reflects real actions taken in the system.
- **Admission Gating:** New patients can only be admitted once an existing bed is freed via discharge or recorded mortality.

### 2. Mandatory Daily Sequence (`Nurse → Doctor → Admin`)
1. **Nurse Daily Thermometry (`/nurse`)**
   - Logs one body temperature reading per active patient per facility day.
   - Blocks duplicate daily checks; edits require an audited **Correct Typo** workflow with a mandatory clinical reason.
2. **Doctor Consultation & Treatment (`/doctor`)**
   - Default queue displays patients whose temperature has been recorded today (`Ready for Doctor`), with `CRITICAL EMERGENCY` cases pinned to the top.
   - Provides a combined override (**Record Temp + Log Treatment**) when evaluating a patient without a same-day nurse reading.
   - **Discharge Eligibility:** **Approve Discharge** is strictly unlocked only after **3 consecutive fever-free days (`< 37.5°C`)**.
3. **Admin & Bed Management (`/admin`)**
   - Processes the **Pending Discharge Queue** with one-click checkout that frees the room/bed slot and records a `CURED_DISCHARGED` outcome.
   - Tracks live **85.0% Treatment Success / 15.0% Mortality** benchmarks and surfaces a high-priority warning banner whenever facility mortality exceeds `15.0%`.

### 3. Two-Tier Physiological Temperature Validation
| Tier / Range | Classification | System Behavior |
| :--- | :--- | :--- |
| `< 13.7°C` or `> 46.7°C` | **Out of Human Survival Bounds** | Hard-blocked immediately as an input/typing error (e.g., `368` instead of `36.8`). |
| `13.7°C – 35.0°C` or `42.0°C – 46.7°C` | **Critical Survival Warning** | Requires explicit clinician confirmation and flags the patient as `CRITICAL EMERGENCY`. |
| `< 37.5°C` (within safe bounds) | **Afebrile (Normal)** | Increments consecutive fever-free streak (`noFeverDays + 1`). |
| `>= 37.5°C` | **Fever** | Immediately resets `noFeverDays` back to `0`. |

---

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS v4, Motion, Lucide React
- **Backend / Server:** Express, `tsx`, REST health endpoint (`/api/health`)
- **Domain Logic & Testing:** Pure TypeScript clinical state machine (`src/backend/controllers.ts`) with unit tests written using Node's built-in test runner (`node:test`)

---

## Getting Started

### Prerequisites
- **Node.js** (v18+ recommended) and **npm**

### Local Development
```bash
# 1. Install dependencies
npm install

# 2. Start the Express + Vite full-stack dev server (port 3000)
npm run dev
```

Open `http://localhost:3000` in your browser.

### Available Scripts
| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the Express + Vite development server on port `3000` |
| `npm run build` | Builds the production frontend bundle into `dist/` |
| `npm run start` | Runs the server entry point via Node |
| `npm run preview` | Previews the built Vite bundle locally |
| `npm run lint` | Runs TypeScript type-checking (`tsc --noEmit`) |
| `npx tsx --test src/backend/controllers.test.ts` | Executes the clinical state machine & validation test suite |

---

## Demo Staff Accounts & Seed Cohorts

For immediate evaluation, the login screen provides both credential login and 1-click auto-login buttons, plus an instant role switcher in the header:

| Role | Email | Password | Staff Profile | Route |
| :--- | :--- | :--- | :--- | :--- |
| **Nurse** | `nurse@facility.in` | `nurse123` | Sister Sunita Deshmukh | `/nurse` |
| **Doctor** | `doctor@facility.in` | `doctor123` | Dr. Mohan Bhargava | `/doctor` |
| **Admin** | `admin@facility.in` | `admin123` | Rajesh Sharma | `/admin` |

The initial **74-patient seed** is partitioned into four cohorts so every workflow stage can be tested immediately:
- **Beds 1–20:** Pending today's nurse temperature check (Beds 1–8 sit at `2/3` fever-free days).
- **Beds 21–48:** Temperature recorded today, awaiting doctor visit (Beds 21–28 are at `3/3` fever-free days for discharge approval).
- **Beds 49–68:** Both today's nurse check and doctor visit completed.
- **Beds 69–74:** Doctor-approved and waiting in the Admin **Pending Discharge Queue**.

---

## Project Structure

```text
├── context/
│   ├── developer_constraints.md     # Physiological bounds, RBAC & sequence rules
│   └── facility_requirements.md     # Operational rules & 74-bed seed cohorts
├── public/
│   └── _redirects                   # SPA fallback routing for static/render hosts
├── src/
│   ├── backend/
│   │   ├── database.ts              # Relational schema & 74-patient initial seed
│   │   ├── controllers.ts           # Validation, clinical state machine & metrics
│   │   └── controllers.test.ts      # Unit tests for survival bounds & workflows
│   ├── components/
│   │   ├── StaffLoginView.tsx       # Staff login & 1-click evaluation sign-in
│   │   ├── TopChrome.tsx            # Sticky KPI bar, role switcher & day controls
│   │   ├── NurseView.tsx            # Thermometry queue, survival warnings & typo audit
│   │   ├── DoctorView.tsx           # Clinical queue, CRITICAL EMERGENCY & discharge approval
│   │   ├── AdminView.tsx            # Discharge checkout, admissions & 85% benchmark tracker
│   │   ├── PatientCardParts.tsx     # Reusable progress indicators & bed badges
│   │   ├── PatientJournalModal.tsx  # Longitudinal temperature & visit history modal
│   │   └── ErrorPages.tsx           # Error boundary, 404 & 500 views
│   ├── services/
│   │   └── keepAliveAndSync.ts      # Background /api/health heartbeat service
│   ├── App.tsx                      # Routing, session management & mortality alerts
│   ├── index.css                    # Global typography & layout styling
│   └── main.tsx                     # React entry point
├── memory.md                        # System architecture & schema reference
├── server.ts                        # Express server with /api/health & Vite middleware
├── package.json
├── tsconfig.json
└── vite.config.ts
```
