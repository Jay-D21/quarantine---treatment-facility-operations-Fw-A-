/**
 * Transactional Relational Database Layer (src/backend/database.ts)
 * Enforces relational tables: rooms, patients, temperature_logs, doctor_visits, facility_outcomes.
 * Seeded with 74 authentic Indian patient names across Rooms 1 to 10.
 */

export type PatientStatus = 'ACTIVE' | 'DISCHARGED_CURED' | 'DECEASED';
export type CohortGroup = 'GROUP_A' | 'GROUP_B' | 'GROUP_C' | 'GROUP_D' | 'ADMITTED';

export interface RoomRecord {
  id: number; // 1 to 10
  name: string;
  sector: string;
  capacity: number; // 7 or 8 (sum = 74)
}

export interface PatientRecord {
  id: string; // e.g. PT-1001
  bedNumber: number; // 1 to 74
  roomId: number; // FK -> rooms.id (1 to 10)
  roomSlot: number; // 1 to 8
  fullName: string;
  age: number;
  admissionDay: number;
  cohortGroup: CohortGroup;
  status: PatientStatus;
  noFeverDays: number; // Consecutive days < 37.5°C (0 to 3+)
  streakBeforeToday: number; // Used for accurate recalculation if today's temp is edited
  tempRecordedToday: boolean;
  todayTempCelsius: number | null;
  todayHasFever: boolean | null;
  isCriticalEmergency: boolean; // Flagged when temp is in critical survival warning range (13.7-35.0°C or 42.0-46.7°C)
  doctorVisitedToday: boolean;
  approvedForDischarge: boolean;
  approvedByDoctorAt: string | null;
  admittedNotes: string;
}

export interface TemperatureLogRecord {
  id: string;
  patientId: string; // FK -> patients.id
  facilityDay: number;
  recordedAt: string;
  celsius: number; // 13.7 to 46.7
  hasFever: boolean; // >= 37.5
  isCriticalEmergency?: boolean;
  recordedByRole: 'NURSE' | 'DOCTOR_OVERRIDE';
  recordedByName: string;
  streakAfterLog: number;
  editReason: string | null;
}

export interface DoctorVisitRecord {
  id: string;
  patientId: string; // FK -> patients.id
  facilityDay: number;
  visitedAt: string;
  doctorName: string;
  treatmentNotes: string;
  tempReviewedCelsius: number;
  noFeverDaysAtVisit: number;
  recommendedDischarge: boolean;
  usedNurseOverride: boolean;
}

export interface FacilityOutcomeRecord {
  id: string;
  patientId: string; // FK -> patients.id
  patientName: string;
  roomId: number;
  bedNumber: number;
  outcomeType: 'CURED_DISCHARGED' | 'MORTALITY';
  facilityDay: number;
  recordedAt: string;
  authorizedBy: string;
  clinicalSummary: string;
}

export interface RelationalDatabaseSchema {
  version: number;
  currentFacilityDay: number;
  nextPatientSequence: number;
  lastUpdatedIso: string;
  rooms: RoomRecord[];
  patients: PatientRecord[];
  temperature_logs: TemperatureLogRecord[];
  doctor_visits: DoctorVisitRecord[];
  facility_outcomes: FacilityOutcomeRecord[];
}

const STORAGE_KEY = 'qtf_relational_db_v2';
const IDB_NAME = 'qtf_facility_db_v2';
const IDB_STORE = 'relational_state';

/**
 * 74 Authentic Indian Patient Names across Ward Rooms 1 to 10
 */
export const INDIAN_PATIENT_NAMES: string[] = [
  // Group A (Beds 1 to 20 — Needs Temp Check Today; Beds 1-8 have 2/3 fever-free days)
  'Aarav Joshi',
  'Sunita Patil',
  'Rajeshwari Iyer',
  'Vikramaditya Rao',
  'Meenakshi Nair',
  'Harbhajan Singh',
  'Pradeep Chatterjee',
  'Farhan Sheikh',
  'Kavita Deshpande',
  'Ramesh Kulkarni',
  'Ananya Mukhopadhyay',
  'Suresh Gowda',
  'Deepika Subramanian',
  'Arjun Malhotra',
  'PoojaChauhan'.replace('PoojaChauhan', 'Pooja Chauhan'),
  'Mahesh Tiwari',
  'Nandini Venkataraman',
  'Siddharth Banerji',
  'Lakshmi Narayanan',
  'Gaurav Srivastava',

  // Group B (Beds 21 to 48 — Ready for Doctor Visit; Beds 21-28 have 3/3 fever-free days)
  'devika Agnihotri'.replace('devika', 'Devika'),
  'Rohan Deshmukh',
  'Padmavati Reddy',
  'Ashokvardhan Mehta',
  'Shalini Bose',
  'Karanveer Gill',
  'Swati Karmakar',
  'Mohammed Azharuddin',
  'Bhavana Shetty',
  'Nitin Gadkari-Patel'.replace('-Patel', ' Patel'),
  'Priyanka Sengupta',
  'Sanjay Shinde',
  'Usha Krishnamurthy',
  'Abhishek Pandey',
  'Rekha Nambiar',
  'Manoj Bajpai-Verma'.replace('Bajpai-Verma', 'Verma'),
  'Gayatri Sundaram',
  'Tarun Bhattacharya',
  'Aishwarya Menon',
  'Dinesh Choudhary',
  'Vasundhara Raje-Scindia'.replace('Raje-Scindia', 'Kulkarni'),
  'Prakash Ambedkar-Jadhav'.replace('Ambedkar-Jadhav', 'Jadhav'),
  'Shruti Hegde',
  'Vivek Oberoi-Kapoor'.replace('Oberoi-Kapoor', 'Kapoor'),
  'Snehalata Gokhale',
  'Raghuram Rajan-Iyer'.replace('Rajan-Iyer', 'Iyer'),
  'Madhuri Dixit-Nene'.replace('Dixit-Nene', 'Phadke'),
  'dilip Tripathy'.replace('dilip', 'Dilip'),

  // Group C (Beds 49 to 68 — Done for Today: Both Nurse Temp & Doctor Visit Completed)
  'Sudha Murthy-Kulkarni'.replace('Murthy-Kulkarni', 'Murthy'),
  'Naveen Patnaik-Das'.replace('Patnaik-Das', 'Das'),
  'Chitra Ramakrishnan',
  'Hemant Soren-Majhi'.replace('Soren-Majhi', 'Majhi'),
  'Radhika Apte-Bhide'.replace('Apte-Bhide', 'Bhide'),
  'Gopalakrishna Pillai',
  'Smita Tendulkar',
  'Kishore Biyani-Agrawal'.replace('Biyani-Agrawal', 'Agrawal'),
  'Jayanthi Natarajan',
  'Harish Salve-Sawant'.replace('Salve-Sawant', 'Sawant'),
  'Pallavi Joshi-Vaidya'.replace('Joshi-Vaidya', 'Vaidya'),
  'Brijesh Mishra',
  'Shobha De-Khote'.replace('De-Khote', 'Khote'),
  'Anand Mahindra-Shah'.replace('Mahindra-Shah', 'Shah'),
  'Mrinalini Sarabhai',
  'Yogeshwar Dutt-Sharma'.replace('Dutt-Sharma', 'Sharma'),
  'Kiran Mazumdar',
  'Pankaj Tripathi',
  'Geeta Phogat-Punia'.replace('Phogat-Punia', 'Punia'),
  'Shashi Tharoor-Menon'.replace('Tharoor-Menon', 'Panicker'),

  // Group D (Beds 69 to 74 — 3/3 Fever-Free Days & Approved for Discharge in Admin Queue)
  'Narayana Murthy',
  'Arundhati Bhattacharya',
  'Ratan Tata-Mistry'.replace('Tata-Mistry', 'Mistry'),
  'Indra Nooyi-Krishnan'.replace('Nooyi-Krishnan', 'Krishnan'),
  'Azim Premji-Merchant'.replace('Premji-Merchant', 'Merchant'),
  'Vandana Shiva-Rawat'.replace('Shiva-Rawat', 'Rawat'),
];

/**
 * Maps global bed number (1..74) to Ward Room (1..10) and Room Slot (1..8)
 * Rooms 1-4: 8 beds each (Beds 1-32)
 * Rooms 5-10: 7 beds each (Beds 33-74)
 */
export function mapBedToRoom(bedNumber: number): { roomId: number; roomSlot: number } {
  if (bedNumber <= 32) {
    const roomId = Math.floor((bedNumber - 1) / 8) + 1;
    const roomSlot = ((bedNumber - 1) % 8) + 1;
    return { roomId, roomSlot };
  }
  const offset = bedNumber - 33;
  const roomId = Math.floor(offset / 7) + 5;
  const roomSlot = (offset % 7) + 1;
  return { roomId, roomSlot };
}

/**
 * Generates deterministic initial 74-patient seed state across Ward Rooms 1-10
 * with authentic Indian patient names and zero fake historical cure/death counts.
 */
export function createSeedDatabase(): RelationalDatabaseSchema {
  const currentFacilityDay = 4; // Day 4 of digital facility operations
  const baseDate = new Date('2026-11-12T07:30:00.000Z');

  const rooms: RoomRecord[] = [
    { id: 1, name: 'Room 1', sector: 'North Isolation Wing', capacity: 8 },
    { id: 2, name: 'Room 2', sector: 'North Isolation Wing', capacity: 8 },
    { id: 3, name: 'Room 3', sector: 'North Isolation Wing', capacity: 8 },
    { id: 4, name: 'Room 4', sector: 'North Isolation Wing', capacity: 8 },
    { id: 5, name: 'Room 5', sector: 'South Treatment Wing', capacity: 7 },
    { id: 6, name: 'Room 6', sector: 'South Treatment Wing', capacity: 7 },
    { id: 7, name: 'Room 7', sector: 'South Treatment Wing', capacity: 7 },
    { id: 8, name: 'Room 8', sector: 'South Treatment Wing', capacity: 7 },
    { id: 9, name: 'Room 9', sector: 'South Treatment Wing', capacity: 7 },
    { id: 10, name: 'Room 10', sector: 'South Treatment Wing', capacity: 7 },
  ];

  const patients: PatientRecord[] = [];
  const temperature_logs: TemperatureLogRecord[] = [];
  const doctor_visits: DoctorVisitRecord[] = [];

  for (let bed = 1; bed <= 74; bed++) {
    const { roomId, roomSlot } = mapBedToRoom(bed);
    const patientId = `PT-${1000 + bed}`;
    const fullName = INDIAN_PATIENT_NAMES[bed - 1] || `Patient ${bed}`;
    const age = bed === 18 ? 54 : 24 + ((bed * 7) % 52);

    let cohortGroup: CohortGroup = 'GROUP_A';
    let noFeverDays = 0;
    let streakBeforeToday = 0;
    let tempRecordedToday = false;
    let todayTempCelsius: number | null = null;
    let todayHasFever: boolean | null = null;
    let doctorVisitedToday = false;
    let approvedForDischarge = false;
    let approvedByDoctorAt: string | null = null;

    if (bed >= 1 && bed <= 20) {
      // Group A: Waiting for today's Nurse temperature check
      cohortGroup = 'GROUP_A';
      tempRecordedToday = false;
      doctorVisitedToday = false;
      approvedForDischarge = false;

      if (bed <= 8) {
        // Beds 1-8 have 2 consecutive fever-free days! Logging < 37.5°C today brings them to 3/3.
        noFeverDays = 2;
        streakBeforeToday = 2;
      } else if (bed <= 14) {
        noFeverDays = 1;
        streakBeforeToday = 1;
      } else {
        noFeverDays = 0;
        streakBeforeToday = 0;
      }
    } else if (bed >= 21 && bed <= 48) {
      // Group B: Today's temperature logged by nurse, waiting in Doctor's "Ready for Visit" queue
      cohortGroup = 'GROUP_B';
      tempRecordedToday = true;
      doctorVisitedToday = false;
      approvedForDischarge = false;

      if (bed <= 28) {
        // Beds 21-28 have reached 3/3 fever-free days today! Ready for Doctor to Approve Discharge.
        streakBeforeToday = 2;
        noFeverDays = 3;
        todayTempCelsius = Number((36.5 + ((bed % 5) * 0.1)).toFixed(1)); // 36.5 - 36.9°C
        todayHasFever = false;
      } else if (bed <= 38) {
        // Normal temperature today, 1/3 or 2/3 fever-free days
        streakBeforeToday = bed % 2 === 0 ? 1 : 0;
        noFeverDays = streakBeforeToday + 1;
        todayTempCelsius = Number((36.7 + ((bed % 4) * 0.1)).toFixed(1)); // 36.7 - 37.0°C
        todayHasFever = false;
      } else {
        // Beds 39-48: Logged fever today (>= 37.5°C), streak reset to 0
        streakBeforeToday = bed % 2 === 0 ? 1 : 0;
        noFeverDays = 0;
        todayTempCelsius = Number((37.9 + ((bed % 6) * 0.2)).toFixed(1)); // 37.9 - 38.9°C
        todayHasFever = true;
      }
    } else if (bed >= 49 && bed <= 68) {
      // Group C: Both today's Nurse temperature check and Doctor visit are completed
      cohortGroup = 'GROUP_C';
      tempRecordedToday = true;
      doctorVisitedToday = true;
      approvedForDischarge = false;

      if (bed <= 58) {
        streakBeforeToday = bed % 2;
        noFeverDays = streakBeforeToday + 1; // 1 or 2 consecutive fever-free days
        todayTempCelsius = Number((36.6 + ((bed % 4) * 0.1)).toFixed(1));
        todayHasFever = false;
      } else {
        streakBeforeToday = 0;
        noFeverDays = 0;
        todayTempCelsius = Number((37.8 + ((bed % 5) * 0.2)).toFixed(1));
        todayHasFever = true;
      }
    } else {
      // Group D (Beds 69 to 74): 3/3 fever-free days completed and approved for discharge by Doctor
      cohortGroup = 'GROUP_D';
      streakBeforeToday = 2;
      noFeverDays = 3;
      tempRecordedToday = true;
      todayTempCelsius = Number((36.6 + ((bed % 3) * 0.1)).toFixed(1));
      todayHasFever = false;
      doctorVisitedToday = true;
      approvedForDischarge = true;
      approvedByDoctorAt = new Date(baseDate.getTime() + bed * 60000).toISOString();
    }

    patients.push({
      id: patientId,
      bedNumber: bed,
      roomId,
      roomSlot,
      fullName,
      age,
      admissionDay: 1,
      cohortGroup,
      status: 'ACTIVE',
      noFeverDays,
      streakBeforeToday,
      tempRecordedToday,
      todayTempCelsius,
      todayHasFever,
      isCriticalEmergency: false,
      doctorVisitedToday,
      approvedForDischarge,
      approvedByDoctorAt,
      admittedNotes: 'Admitted under acute viral febrile isolation protocol.',
    });

    // Seed realistic prior-day temperature logs & doctor visits (Days 1, 2, 3) matching streakBeforeToday
    const priorTemperatures: number[] = [];
    if (streakBeforeToday === 2) {
      priorTemperatures.push(38.4, 36.9, 36.7); // Day 1 fever, Day 2 normal, Day 3 normal
    } else if (streakBeforeToday === 1) {
      priorTemperatures.push(38.6, 37.9, 36.8); // Day 1 fever, Day 2 fever, Day 3 normal
    } else {
      priorTemperatures.push(38.8, 38.2, 37.8); // Days 1-3 febrile
    }

    let runningStreak = 0;
    for (let dayIdx = 0; dayIdx < 3; dayIdx++) {
      const dayNumber = dayIdx + 1;
      const tempVal = priorTemperatures[dayIdx];
      const isFebrile = tempVal >= 37.5;
      runningStreak = isFebrile ? 0 : runningStreak + 1;

      const dayTime = new Date(baseDate.getTime() - (3 - dayIdx) * 86400000 + bed * 30000);
      temperature_logs.push({
        id: `TLOG-${patientId}-D${dayNumber}`,
        patientId,
        facilityDay: dayNumber,
        recordedAt: dayTime.toISOString(),
        celsius: tempVal,
        hasFever: isFebrile,
        isCriticalEmergency: false,
        recordedByRole: 'NURSE',
        recordedByName: 'Sister Sunita Deshmukh',
        streakAfterLog: runningStreak,
        editReason: null,
      });

      doctor_visits.push({
        id: `DVIS-${patientId}-D${dayNumber}`,
        patientId,
        facilityDay: dayNumber,
        visitedAt: new Date(dayTime.getTime() + 3600000).toISOString(),
        doctorName: 'Dr. Mohan Bhargava',
        treatmentNotes: isFebrile
          ? 'Paracetamol 650mg TDS + oral antiviral protocol and ORS hydration.'
          : 'No fever (< 37.5°C). Continue maintenance antiviral and multivitamin support.',
        tempReviewedCelsius: tempVal,
        noFeverDaysAtVisit: runningStreak,
        recommendedDischarge: false,
        usedNurseOverride: false,
      });
    }

    // If today's temperature was already recorded (Groups B, C, D), add Day 4 temperature log
    if (tempRecordedToday && todayTempCelsius !== null && todayHasFever !== null) {
      const todayTime = new Date(baseDate.getTime() + bed * 45000);
      temperature_logs.push({
        id: `TLOG-${patientId}-D${currentFacilityDay}`,
        patientId,
        facilityDay: currentFacilityDay,
        recordedAt: todayTime.toISOString(),
        celsius: todayTempCelsius,
        hasFever: todayHasFever,
        isCriticalEmergency: false,
        recordedByRole: 'NURSE',
        recordedByName: 'Sister Sunita Deshmukh',
        streakAfterLog: noFeverDays,
        editReason: null,
      });

      if (doctorVisitedToday) {
        doctor_visits.push({
          id: `DVIS-${patientId}-D${currentFacilityDay}`,
          patientId,
          facilityDay: currentFacilityDay,
          visitedAt: new Date(todayTime.getTime() + 2400000).toISOString(),
          doctorName: 'Dr. Mohan Bhargava',
          treatmentNotes: approvedForDischarge
            ? 'Completed 3 full consecutive fever-free days (< 37.5°C). Approved for immediate discharge.'
            : todayHasFever
            ? 'Fever persists (>= 37.5°C). Adjusted antiviral dosage and 6-hourly antipyretic schedule.'
            : 'Fever-free progression continues. Observe for 3 consecutive days before discharge.',
          tempReviewedCelsius: todayTempCelsius,
          noFeverDaysAtVisit: noFeverDays,
          recommendedDischarge: approvedForDischarge,
          usedNurseOverride: false,
        });
      }
    }
  }

  return {
    version: 2,
    currentFacilityDay,
    nextPatientSequence: 1075,
    lastUpdatedIso: new Date().toISOString(),
    rooms,
    patients,
    temperature_logs,
    doctor_visits,
    facility_outcomes: [], // Zero fake historical cure/death counts
  };
}

class TransactionalDatabase {
  private memoryState: RelationalDatabaseSchema | null = null;
  private lockBusy = false;
  private listeners: Set<() => void> = new Set();

  public getState(): RelationalDatabaseSchema {
    if (!this.memoryState) {
      this.memoryState = this.loadFromStorageOrSeed();
    }
    return this.memoryState;
  }

  private loadFromStorageOrSeed(): RelationalDatabaseSchema {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as RelationalDatabaseSchema;
          if (
            parsed &&
            parsed.version === 2 &&
            Array.isArray(parsed.rooms) &&
            Array.isArray(parsed.patients) &&
            Array.isArray(parsed.temperature_logs) &&
            Array.isArray(parsed.doctor_visits) &&
            Array.isArray(parsed.facility_outcomes)
          ) {
            return parsed;
          }
        }
      } catch {
        // Fall through to fresh seed on corrupted state
      }
    }

    const seeded = createSeedDatabase();
    this.persistState(seeded);
    return seeded;
  }

  private persistState(state: RelationalDatabaseSchema): void {
    this.memoryState = state;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const serialized = JSON.stringify(state);
        window.localStorage.setItem(STORAGE_KEY, serialized);
        this.mirrorToIndexedDB(state);
      } catch {
        // Ignore quota errors in restricted sandboxes
      }
    }
  }

  private mirrorToIndexedDB(state: RelationalDatabaseSchema): void {
    if (typeof window === 'undefined' || !('indexedDB' in window)) return;
    try {
      const request = window.indexedDB.open(IDB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(state, 'latest');
      };
    } catch {
      // Non-blocking IndexedDB backup
    }
  }

  /**
   * Executes a synchronous ACID transaction with deep-clone rollback protection.
   */
  public executeTransaction<T>(
    mutator: (draft: RelationalDatabaseSchema) => T
  ): T {
    if (this.lockBusy) {
      throw new Error('ACID_LOCK_CONTENTION: Concurrent database transaction in progress.');
    }
    this.lockBusy = true;
    try {
      const current = this.getState();
      const draft: RelationalDatabaseSchema = JSON.parse(JSON.stringify(current));
      const result = mutator(draft);
      draft.lastUpdatedIso = new Date().toISOString();
      this.persistState(draft);
      this.notifyListeners();
      return result;
    } finally {
      this.lockBusy = false;
    }
  }

  public resetToInitialSeed(): RelationalDatabaseSchema {
    const fresh = createSeedDatabase();
    this.persistState(fresh);
    this.notifyListeners();
    return fresh;
  }

  public reloadFromStorage(): RelationalDatabaseSchema {
    this.memoryState = this.loadFromStorageOrSeed();
    this.notifyListeners();
    return this.memoryState;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const db = new TransactionalDatabase();
