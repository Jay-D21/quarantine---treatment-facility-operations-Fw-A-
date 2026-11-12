# System Memory Map (`memory.md`)

## 1. Project File Tree & Architecture
```text
/
├── context/
│   ├── developer_constraints.md    # Two-tier survival temperature bounds, RBAC, and daily sequence rules
│   └── facility_requirements.md    # Operational rules for the 74-bed quarantine centre
├── public/
│   └── _redirects                  # SPA routing fallback (/* /index.html 200) for Netlify/Render
├── memory.md                       # System memory map, schema documentation, and state transitions
├── server.ts                       # Express full-stack server with /api/health keep-alive endpoint + Vite middleware
├── src/
│   ├── backend/
│   │   ├── database.ts             # Transactional relational DB (rooms, patients, temperature_logs, doctor_visits, facility_outcomes) with 74 Indian patient names
│   │   ├── controllers.ts          # Two-tier physiological survival validation (13.7-46.7°C), CRITICAL EMERGENCY flagging, and role locks
│   │   └── controllers.test.ts     # Node test runner unit tests verifying clinical state machine & survival bounds
│   ├── components/
│   │   ├── StaffLoginView.tsx      # Clean Staff Login page with credentials displayed on screen + 1-click auto-login buttons
│   │   ├── TopChrome.tsx           # Sticky top header with compact KPI pills, instant Role Switcher, Next Day, Reset 74 Beds, and Logout
│   │   ├── PatientCardParts.tsx    # Reusable 3-Day No-Fever Progress Dots, Today's Status Pill, and Room & Bed Badge
│   │   ├── NurseView.tsx           # Responsive Card Grid for Nurse Check + preset modal + two-tier survival warning + Correct typo modal
│   │   ├── DoctorView.tsx          # Responsive Card Grid for Doctor Visit + CRITICAL EMERGENCY priority + Approve Discharge
│   │   ├── AdminView.tsx           # Admin & Beds view with 1-click Discharge & Free Bed, Admit New Patient, and 85% Benchmark Tracker
│   │   ├── PatientJournalModal.tsx # Full longitudinal temperature journal and clinical visit history modal
│   │   └── ErrorPages.tsx          # Custom 404 Not Found, 500 Server Error, and Global Error Boundary with self-heal
│   ├── services/
│   │   └── keepAliveAndSync.ts     # Self-calling background heartbeat service (4-min interval + visibilitychange)
│   ├── App.tsx                     # Application router, login session manager, mortality alert banner, and footer status
│   ├── index.css                   # Plus Jakarta Sans typography, #F8FAFC canvas, and overflow-x-hidden rules
│   └── main.tsx                    # React root entry point
```

## 2. Relational Database Schema (`src/backend/database.ts`)
- **`rooms`**: 10 rooms (`Room 1` to `Room 10`), 7–8 beds per room totaling 74 beds.
- **`patients`**: 74 active patients with authentic Indian names (`Aarav Joshi`, `Sunita Patil`, `Ramesh Kulkarni`, etc.), `noFeverDays` (`0..3+`), `tempRecordedToday`, `todayTempCelsius`, `todayHasFever`, `isCriticalEmergency`, `doctorVisitedToday`, and `approvedForDischarge`.
- **`temperature_logs`**: Longitudinal daily temperature entries with `isCriticalEmergency` and `editReason` audit fields.
- **`doctor_visits`**: Daily consultation & treatment records and discharge approvals.
- **`facility_outcomes`**: Immutable log of `CURED_DISCHARGED` and `MORTALITY` events powering the live 85% Cure / 15% Mortality Benchmark Tracker.
