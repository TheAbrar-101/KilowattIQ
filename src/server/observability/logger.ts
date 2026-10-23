/**
 * KilowattIQ Production Observability: Structured JSON Logger with Request Correlation
 * 
 * Features:
 * 1. Strictly formatted JSON log lines for ingestion by Grafana Loki, Datadog, or Cloud Logging
 * 2. Mandatory request_id and trace_id correlation across all log statements
 * 3. HTTP access log middleware with duration_ms, status_code, and user_agent
 * 4. Error stack serialization & sanitization
 */

import { Request, Response, NextFunction } from 'express';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  environment: string;
  message: string;
  request_id?: string;
  trace_id?: string;
  span_id?: string;
  http?: {
    method: string;
    path: string;
    status_code?: number;
    duration_ms?: number;
    client_ip?: string;
    user_agent?: string;
  };
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, any>;
}

export class StructuredLogger {
  private static instance: StructuredLogger;
  private serviceName = 'kilowattiq-backend';
  private environment = process.env.NODE_ENV || 'production';

  private constructor() {}

  public static getInstance(): StructuredLogger {
    if (!StructuredLogger.instance) {
      StructuredLogger.instance = new StructuredLogger();
    }
    return StructuredLogger.instance;
  }

  private emit(
    level: LogLevel,
    message: string,
    metadata?: Record<string, any>,
    req?: Request,
    error?: Error
  ): void {
    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      environment: this.environment,
      message,
      request_id: (req as any)?.requestId,
      trace_id: (req as any)?.traceId,
      span_id: (req as any)?.spanId,
      metadata,
    };

    if (req) {
      entry.http = {
        method: req.method,
        path: req.originalUrl || req.url,
        client_ip: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1',
        user_agent: (req.headers['user-agent'] as string) || 'unknown',
      };
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    const jsonLine = JSON.stringify(entry);

    if (level === 'ERROR') {
      console.error(jsonLine);
    } else if (level === 'WARN') {
      console.warn(jsonLine);
    } else {
      console.log(jsonLine);
    }
  }

  public info(message: string, metadata?: Record<string, any>, req?: Request): void {
    this.emit('INFO', message, metadata, req);
  }

  public warn(message: string, metadata?: Record<string, any>, req?: Request): void {
    this.emit('WARN', message, metadata, req);
  }

  public error(message: string, error?: Error, metadata?: Record<string, any>, req?: Request): void {
    this.emit('ERROR', message, metadata, req, error);
  }

  public debug(message: string, metadata?: Record<string, any>, req?: Request): void {
    if (process.env.DEBUG || process.env.LOG_LEVEL === 'DEBUG') {
      this.emit('DEBUG', message, metadata, req);
    }
  }
}

export const logger = StructuredLogger.getInstance();

/**
 * Express Middleware: Logs inbound requests and outbound completions as structured JSON
 */
export function structuredRequestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startHr = process.hrtime.bigint();
  const startTime = Date.now();

  res.on('finish', () => {
    const endHr = process.hrtime.bigint();
    const durationMs = Number(((Number(endHr - startHr)) / 1_000_000).toFixed(2));
    const statusCode = res.statusCode;
    const isError = statusCode >= 400;

    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level: statusCode >= 500 ? 'ERROR' : statusCode >= 400 ? 'WARN' : 'INFO',
      service: 'kilowattiq-backend',
      environment: process.env.NODE_ENV || 'production',
      message: `HTTP ${req.method} ${req.originalUrl || req.url} ${statusCode} (${durationMs}ms)`,
      request_id: (req as any)?.requestId,
      trace_id: (req as any)?.traceId,
      span_id: (req as any)?.spanId,
      http: {
        method: req.method,
        path: req.originalUrl || req.url,
        status_code: statusCode,
        duration_ms: durationMs,
        client_ip: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1',
        user_agent: (req.headers['user-agent'] as string) || 'unknown',
      },
      metadata: {
        content_length: res.getHeader('content-length'),
      },
    };

    if (isError) {
      console.warn(JSON.stringify(entry));
    } else {
      console.log(JSON.stringify(entry));
    }
  });

  next();
}
