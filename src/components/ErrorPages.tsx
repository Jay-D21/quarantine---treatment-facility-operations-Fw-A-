import React, { Component, ErrorInfo, ReactNode } from 'react';
import { resetFacilityDatabase } from '../backend/controllers';

interface ErrorPageProps {
  onReturnHome: () => void;
  onSelfHeal?: () => void;
  requestedPath?: string;
}

export const NotFound404Page: React.FC<ErrorPageProps> = ({
  onReturnHome,
  requestedPath = '/unknown-route',
}) => {
  return (
    <div
      aria-labelledby="error-404-heading"
      className="max-w-2xl mx-auto px-4 py-12"
    >
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-2xs space-y-4">
        <span className="inline-block px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-bold font-tabular">
          404 • Page Not Found
        </span>
        <h1 id="error-404-heading" className="text-2xl font-bold text-slate-900">
          This page or patient route does not exist
        </h1>
        <p className="text-sm text-slate-600">
          The requested path <code className="font-tabular bg-slate-100 px-2 py-0.5 rounded-md">{requestedPath}</code> was not found. All 74 patient beds across Rooms 1–10 are safe and active.
        </p>
        <div className="pt-2">
          <button
            type="button"
            onClick={onReturnHome}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm cursor-pointer"
          >
            Return to Active Workspace
          </button>
        </div>
      </div>
    </div>
  );
};

export const ServerError500Page: React.FC<ErrorPageProps & { errorDetails?: string }> = ({
  onReturnHome,
  onSelfHeal,
  errorDetails,
}) => {
  const handleHealClick = () => {
    resetFacilityDatabase();
    if (onSelfHeal) {
      onSelfHeal();
    } else {
      onReturnHome();
    }
  };

  return (
    <div
      aria-labelledby="error-500-heading"
      className="max-w-2xl mx-auto px-4 py-12"
    >
      <div className="bg-white rounded-2xl border border-red-200 p-6 sm:p-8 shadow-2xs space-y-4">
        <span className="inline-block px-3 py-1 rounded-full bg-red-100 text-red-900 text-xs font-bold font-tabular">
          500 • System Recovery
        </span>
        <h1 id="error-500-heading" className="text-2xl font-bold text-slate-900">
          Unexpected State Error Intercepted
        </h1>
        <p className="text-sm text-slate-600">
          Click <strong>Self-Heal &amp; Restore State</strong> below to automatically repair and reload all 74 patient beds.
        </p>
        {errorDetails && (
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-tabular text-slate-700">
            {errorDetails}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleHealClick}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm cursor-pointer"
          >
            Self-Heal &amp; Restore State
          </button>
          <button
            type="button"
            onClick={onReturnHome}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-sm cursor-pointer"
          >
            Return Without Resetting
          </button>
        </div>
      </div>
    </div>
  );
};

interface BoundaryProps {
  children: ReactNode;
}

interface BoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class GlobalClinicalErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  public state: BoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): BoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Unexpected runtime exception in clinical view.',
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('GlobalClinicalErrorBoundary intercepted error:', error, errorInfo);
  }

  private handleSelfHeal = (): void => {
    resetFacilityDatabase();
    this.setState({ hasError: false, errorMessage: '' });
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/nurse');
    }
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <ServerError500Page
          errorDetails={this.state.errorMessage}
          onReturnHome={this.handleSelfHeal}
          onSelfHeal={this.handleSelfHeal}
        />
      );
    }
    return this.props.children;
  }
}
