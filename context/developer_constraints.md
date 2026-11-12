# Developer Logical Constraints (`context/developer_constraints.md`)

## 1. Two-Tier Physiological Temperature Validation (Human Survival Limits)
1. **Tier 1 — Hard Block (`< 13.7°C` or `> 46.7°C`)**:
   - `13.7°C` (`56.7°F`) is the lowest core body temperature ever survived by a human, and `46.7°C` (`115.7°F`) is the highest ever survived.
   - Any input outside **`13.7°C to 46.7°C`** is immediately blocked as a typing error (for example, typing `368` instead of `36.8`).
2. **Tier 2 — Critical Survival Warning (`13.7°C - 35.0°C` or `42.0°C - 46.7°C`)**:
   - Unassisted clinical death typically occurs below `24.0°C`, cellular proteins begin unravelling above `42.0°C`, and temperatures above `43.0°C` lead to fatal organ failure.
   - If a clinician enters a value in `13.7°C – 35.0°C` or `42.0°C – 46.7°C`, the system displays a high-priority Confirmation Warning (*"Critical life-threatening temperature entered. Please confirm this is not a typo"*) and upon confirmation flags the patient card in red as **`CRITICAL EMERGENCY`** at the top of the Doctor's queue.
3. **Fever Cutoff (`>= 37.5°C`)**:
   - Readings `< 37.5°C` count as no fever and add `+1` to the 3-day consecutive fever-free counter (`noFeverDays`).
   - Readings `>= 37.5°C` count as fever and reset `noFeverDays` to `0`.

## 2. Staff Login & Instant Role Switcher
- **Nurse Login**: `nurse@facility.in` | Pass: `nurse123` (Sister Sunita Deshmukh)
- **Doctor Login**: `doctor@facility.in` | Pass: `doctor123` (Dr. Mohan Bhargava)
- **Admin Login**: `admin@facility.in` | Pass: `admin123` (Rajesh Sharma)
- Supports both credential form sign-in and 1-click auto-login buttons, plus an instant Role Switcher (`Nurse Check` | `Doctor Visit` | `Admin & Beds`) in the sticky top header.

## 3. Strict Daily Sequence & Role Permissions (`Nurse -> Doctor -> Admin`)
- **Nurse Check (`/nurse`)**:
  - Locks the primary temperature button once logged today to prevent duplicate checks.
  - Allows edits only via a `"Correct typo"` button with a mandatory reason.
- **Doctor Visit (`/doctor`)**:
  - Default queue shows ONLY patients whose temperature was already recorded today (`Ready for Doctor`), with `CRITICAL EMERGENCY` patients pinned to the top.
  - When viewing a patient without today's temperature, shows a prominent warning banner and requires logging the temperature together with the treatment note.
  - Strictly disables `"Approve Discharge"` unless `noFeverDays >= 3`.
- **Admin & Beds (`/admin`)**:
  - Strictly disables `"Admit New Patient"` when occupancy is at `74/74`.
  - Triggers a red top alert banner if facility mortality rises above `15.0%` (or cure rate drops below the `85.0%` benchmark).
