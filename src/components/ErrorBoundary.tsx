import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  hasError: boolean;
  message?: string;
}

/**
 * Globale Fallback-Schicht bei Render-Fehlern. Zeigt eine saubere Fehleransicht
 * mit "Neu laden" statt einer weißen Leinwand.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // In Prod an Observability melden (Sentry etc.).
    console.error("Grow|Observer crashed:", error, info.componentStack);
  }

  reset = () => this.setState({ hasError: false, message: undefined });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center elev-2">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-danger/12 text-danger">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h1 className="mt-4 text-xl font-bold">Etwas ist schiefgelaufen</h1>
          <p className="mt-2 text-sm text-fg-muted">
            Ein unerwarteter Fehler ist aufgetreten. Lade die App neu, um fortzufahren.
          </p>
          {this.state.message && (
            <pre className="mt-3 max-h-24 overflow-auto rounded-lg bg-surface-2 p-2 text-left text-[11px] text-fg-subtle">{this.state.message}</pre>
          )}
          <button
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-medium text-accent-fg hover:brightness-110"
          >
            Neu laden
          </button>
        </div>
      </div>
    );
  }
}
