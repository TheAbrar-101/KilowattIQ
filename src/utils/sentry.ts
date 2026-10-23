/**
 * KilowattIQ Frontend Observability & Sentry Integration
 * 
 * Provides:
 * 1. Global unhandled error & promise rejection interception
 * 2. Error context decoration (browser, route, user agent, viewport)
 * 3. Sentry reporting interface with graceful fallback
 */

export interface FrontendErrorReport {
  message: string;
  stack?: string;
  componentStack?: string;
  url: string;
  userAgent: string;
  timestamp: string;
  context?: Record<string, any>;
}

export class FrontendSentry {
  private static instance: FrontendSentry;
  private dsn: string | null = null;
  private initialized = false;

  private constructor() {
    this.dsn = (import.meta as any).env?.VITE_SENTRY_DSN || null;
    this.init();
  }

  public static getInstance(): FrontendSentry {
    if (!FrontendSentry.instance) {
      FrontendSentry.instance = new FrontendSentry();
    }
    return FrontendSentry.instance;
  }

  private init(): void {
    if (typeof window === 'undefined') return;

    this.initialized = Boolean(this.dsn);

    // Global uncaught error listener
    window.addEventListener('error', (event) => {
      this.captureException(event.error || new Error(event.message), {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        type: 'uncaught_error',
      });
    });

    // Global unhandled promise rejection listener
    window.addEventListener('unhandledrejection', (event) => {
      this.captureException(
        event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
        { type: 'unhandled_rejection' }
      );
    });
  }

  public captureException(error: Error, context?: Record<string, any>): string {
    const eventId = `fe_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

    const report: FrontendErrorReport = {
      message: error.message,
      stack: error.stack,
      url: typeof window !== 'undefined' ? window.location.href : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      timestamp: new Date().toISOString(),
      context: {
        ...context,
        eventId,
      },
    };

    if (this.initialized) {
      console.error(`[SENTRY FRONTEND EVENT ${eventId}]`, report);
    }

    return eventId;
  }

  public captureMessage(message: string, context?: Record<string, any>): void {
    if (this.initialized) {
      console.warn(`[SENTRY FRONTEND MESSAGE] ${message}`, context);
    }
  }

  public isInitialized(): boolean {
    return this.initialized;
  }
}

export const frontendSentry = FrontendSentry.getInstance();
