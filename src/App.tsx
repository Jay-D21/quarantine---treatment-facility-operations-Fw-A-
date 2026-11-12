/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { db, RelationalDatabaseSchema } from './backend/database';
import {
  getFacilityMetrics,
  getRoomOccupancySummaries,
  simulateNextDayRollover,
  resetFacilityDatabase,
  STAFF_ACCOUNTS,
  StaffAccount,
} from './backend/controllers';
import {
  keepAliveService,
  HeartbeatTelemetry,
} from './services/keepAliveAndSync';
import { TopChrome, ActiveRoute } from './components/TopChrome';
import { StaffLoginView } from './components/StaffLoginView';
import { NurseView } from './components/NurseView';
import { DoctorView } from './components/DoctorView';
import { AdminView } from './components/AdminView';
import { PatientJournalModal } from './components/PatientJournalModal';
import {
  NotFound404Page,
  ServerError500Page,
  GlobalClinicalErrorBoundary,
} from './components/ErrorPages';

const STAFF_SESSION_KEY = 'qtf_staff_session_v2';

function resolveRouteFromPathname(pathname: string): {
  route: ActiveRoute;
  rawPath: string;
  isDirectRolePath: boolean;
} {
  const clean = pathname.trim().toLowerCase() || '/';
  if (clean === '/') {
    return { route: '/nurse', rawPath: '/', isDirectRolePath: false };
  }
  if (clean === '/nurse') {
    return { route: '/nurse', rawPath: pathname, isDirectRolePath: true };
  }
  if (clean === '/doctor') {
    return { route: '/doctor', rawPath: pathname, isDirectRolePath: true };
  }
  if (clean === '/admin') {
    return { route: '/admin', rawPath: pathname, isDirectRolePath: true };
  }
  if (clean === '/500') {
    return { route: '/500', rawPath: pathname, isDirectRolePath: true };
  }
  if (clean === '/404') {
    return { route: '/404', rawPath: '/404', isDirectRolePath: true };
  }
  return { route: '/404', rawPath: pathname, isDirectRolePath: true };
}

export default function App() {
  const [dbState, setDbState] = useState<RelationalDatabaseSchema>(() =>
    db.getState()
  );

  const [routeState, setRouteState] = useState<{
    route: ActiveRoute;
    rawPath: string;
  }>(() => {
    if (typeof window === 'undefined') {
      return { route: '/nurse', rawPath: '/nurse' };
    }
    const resolved = resolveRouteFromPathname(window.location.pathname);
    return { route: resolved.route, rawPath: resolved.rawPath };
  });

  // Staff Login Session State
  const [loggedInStaff, setLoggedInStaff] = useState<StaffAccount | null>(() => {
    if (typeof window === 'undefined') return STAFF_ACCOUNTS[0];
    try {
      const saved = window.localStorage.getItem(STAFF_SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as StaffAccount;
        const found = STAFF_ACCOUNTS.find((a) => a.role === parsed.role);
        if (found) return found;
      }
      const params = new URLSearchParams(window.location.search);
      const resolved = resolveRouteFromPathname(window.location.pathname);
      if (params.get('autostart') === '1' || resolved.isDirectRolePath) {
        if (resolved.route === '/doctor') return STAFF_ACCOUNTS[1];
        if (resolved.route === '/admin') return STAFF_ACCOUNTS[2];
        if (resolved.route === '/nurse') return STAFF_ACCOUNTS[0];
      }
    } catch {
      // Ignore storage error
    }
    return null;
  });

  const [journalPatientId, setJournalPatientId] = useState<string | null>(null);
  const [heartbeat, setHeartbeat] = useState<HeartbeatTelemetry>(() =>
    keepAliveService.getTelemetry()
  );
  const [globalNotice, setGlobalNotice] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeDb = db.subscribe(() => {
      setDbState({ ...db.getState() });
    });

    keepAliveService.start();
    const unsubscribeHeartbeat = keepAliveService.subscribe((telemetry) => {
      setHeartbeat({ ...telemetry });
    });
    const unsubscribeSync = keepAliveService.onStateSync(() => {
      setDbState({ ...db.reloadFromStorage() });
    });

    const handlePopState = () => {
      const resolved = resolveRouteFromPathname(window.location.pathname);
      setRouteState({ route: resolved.route, rawPath: resolved.rawPath });
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      unsubscribeDb();
      unsubscribeHeartbeat();
      unsubscribeSync();
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const navigateTo = useCallback((target: ActiveRoute) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', target);
    }
    setRouteState({ route: target, rawPath: target });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleLoginSuccess = (account: StaffAccount) => {
    setLoggedInStaff(account);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STAFF_SESSION_KEY, JSON.stringify(account));
      } catch {
        // Ignore storage error
      }
    }
    navigateTo(account.route);
  };

  const handleLogout = () => {
    setLoggedInStaff(null);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(STAFF_SESSION_KEY);
        window.history.pushState({}, '', '/');
      } catch {
        // Ignore storage error
      }
    }
  };

  const handleRolloverDay = () => {
    const res = simulateNextDayRollover();
    if (res.ok && res.data) {
      setGlobalNotice(
        `Advanced to Day ${res.data.newDay}. Daily check flags have been reset while keeping 3-day fever-free streaks.`
      );
    }
  };

  const handleResetFacility = () => {
    resetFacilityDatabase();
    setGlobalNotice(
      'Reset to 74/74 beds occupied across Rooms 1–10 with authentic Indian patient records and 0 historical outcomes.'
    );
  };

  const metrics = getFacilityMetrics(dbState);
  const roomSummaries = getRoomOccupancySummaries(dbState);

  // Show Staff Login Page when not logged in
  if (!loggedInStaff) {
    return (
      <GlobalClinicalErrorBoundary>
        <StaffLoginView
          onLoginSuccess={handleLoginSuccess}
          metrics={metrics}
        />
      </GlobalClinicalErrorBoundary>
    );
  }

  const isErrorPage = routeState.route === '/404' || routeState.route === '/500';

  return (
    <GlobalClinicalErrorBoundary>
      <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900 overflow-x-hidden">
        {/* Sticky Top Header strictly tailored to the logged-in role */}
        <TopChrome
          metrics={metrics}
          currentStaff={loggedInStaff}
          onRolloverDay={handleRolloverDay}
          onResetFacility={handleResetFacility}
          onLogout={handleLogout}
        />

        {/* Global Red Alert Banner if Facility Mortality Rate > 15.0% (Cure Rate < 85.0% Benchmark) */}
        <div aria-live="assertive" className="w-full">
          {metrics.isMortalityAboveThreshold && (
            <div
              role="alert"
              className="w-full bg-red-600 text-white px-4 py-2.5 border-b border-red-700"
            >
              <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs sm:text-sm">
                <div>
                  <strong>ALERT: Mortality Rate ({metrics.mortalityRatePct?.toFixed(1)}%) Exceeds 15.0% Benchmark!</strong>{' '}
                  Current Cure Rate is {metrics.successRatePct?.toFixed(1)}% vs 85.0% target ({metrics.curedDischargedCount} Cured, {metrics.deceasedCount} Deceased).
                </div>
                <span className="font-tabular font-bold bg-red-800 px-2.5 py-0.5 rounded-lg shrink-0">
                  Benchmark Breach
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Global Next-Day / Reset Toast Banner */}
        <div aria-live="polite" className="w-full">
          {globalNotice && (
            <div className="w-full bg-blue-50 border-b border-blue-200 px-4 py-2">
              <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs sm:text-sm text-blue-950 font-medium">
                <span>{globalNotice}</span>
                <button
                  type="button"
                  onClick={() => setGlobalNotice(null)}
                  className="px-2.5 py-1 rounded-lg bg-white border border-blue-200 text-blue-800 text-xs font-bold cursor-pointer shrink-0"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Main Workspace Content (Strictly locked to the logged-in staff role) */}
        <main className="flex-1 w-full overflow-x-hidden">
          {!isErrorPage && loggedInStaff.role === 'NURSE' && (
            <NurseView
              patients={dbState.patients}
              rooms={dbState.rooms}
              metrics={metrics}
              staffName={loggedInStaff.staffName}
              onSelectJournal={(id) => setJournalPatientId(id)}
            />
          )}

          {!isErrorPage && loggedInStaff.role === 'DOCTOR' && (
            <DoctorView
              patients={dbState.patients}
              rooms={dbState.rooms}
              metrics={metrics}
              staffName={loggedInStaff.staffName}
              onSelectJournal={(id) => setJournalPatientId(id)}
            />
          )}

          {!isErrorPage && loggedInStaff.role === 'ADMIN' && (
            <AdminView
              patients={dbState.patients}
              roomSummaries={roomSummaries}
              outcomes={dbState.facility_outcomes}
              metrics={metrics}
              staffName={loggedInStaff.staffName}
              onSelectJournal={(id) => setJournalPatientId(id)}
            />
          )}

          {routeState.route === '/404' && (
            <NotFound404Page
              requestedPath={routeState.rawPath}
              onReturnHome={() => navigateTo(loggedInStaff.route)}
            />
          )}

          {routeState.route === '/500' && (
            <ServerError500Page
              errorDetails="Manual 500 diagnostic screen triggered for inspection."
              onReturnHome={() => navigateTo(loggedInStaff.route)}
              onSelfHeal={() => {
                handleResetFacility();
                navigateTo(loggedInStaff.route);
              }}
            />
          )}
        </main>

        {/* Patient Longitudinal Journal Modal */}
        <PatientJournalModal
          patientId={journalPatientId}
          onClose={() => setJournalPatientId(null)}
        />

        {/* Compact Footer with Keep-Alive Heartbeat & Error Page Links */}
        <footer
          aria-label="Facility Operations Footer"
          className="w-full bg-white border-t border-slate-200 py-3.5 px-4 sm:px-6 mt-6"
        >
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
            <div>
              74-Bed Quarantine &amp; Treatment Centre (Rooms 1–10) • 3-Day No-Fever (&lt; 37.5°C) Cure Standard
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleResetFacility}
                className="sm:hidden text-xs text-slate-600 hover:text-blue-600 bg-transparent border-none p-0 cursor-pointer"
              >
                Reset 74 Beds
              </button>
              <span aria-hidden="true" className="sm:hidden">|</span>
              <button
                type="button"
                onClick={() => void keepAliveService.pingNow()}
                className="text-xs text-slate-600 hover:text-blue-600 font-tabular bg-transparent border-none p-0 cursor-pointer"
              >
                Heartbeat: {heartbeat.status === 'ACTIVE' ? 'Active' : heartbeat.status} ({heartbeat.latencyMs}ms)
              </button>
              <span aria-hidden="true">|</span>
              <a
                href="/404"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo('/404');
                }}
                className="text-xs text-slate-600 hover:text-blue-600 no-underline"
              >
                404 Page
              </a>
              <span aria-hidden="true">|</span>
              <a
                href="/500"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo('/500');
                }}
                className="text-xs text-slate-600 hover:text-blue-600 no-underline"
              >
                500 Recovery
              </a>
            </div>
          </div>
        </footer>
      </div>
    </GlobalClinicalErrorBoundary>
  );
}
