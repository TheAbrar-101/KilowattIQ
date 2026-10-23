/**
 * KilowattIQ Production Observability Unit Tests
 * 
 * Verifies:
 * 1. OpenTelemetry Distributed Tracing (W3C traceparent, spans, metrics)
 * 2. Structured JSON Logger with request_id and trace_id correlation
 * 3. Expanded Health Check Evaluator (DB, Redis, MQTT, Gemini, Payments)
 * 4. SSE Client Connection Tracking & Queue Depth Metrics
 */

import { ObservabilityTracer } from '../observability/tracing';
import { logger } from '../observability/logger';
import { HealthEvaluator } from '../observability/healthEvaluator';

async function runObservabilityTests() {
  console.log('--- RUNNING OBSERVABILITY & TRACING TESTS ---');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, desc: string) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${desc}`);
      throw new Error(`Assertion failed: ${desc}`);
    }
  }

  const tracer = ObservabilityTracer.getInstance();

  // Test 1: W3C Trace ID Generation
  const traceId = tracer.generateTraceId();
  assert(traceId.length === 32, 'Generates valid 32-character W3C trace ID');

  // Test 2: W3C Span ID Generation
  const spanId = tracer.generateSpanId();
  assert(spanId.length === 16, 'Generates valid 16-character W3C span ID');

  // Test 3: W3C Traceparent Header Parsing
  const sampleTraceParent = `00-${traceId}-${spanId}-01`;
  const parsed = tracer.parseTraceParent(sampleTraceParent);
  assert(parsed !== null && parsed.traceId === traceId && parsed.parentSpanId === spanId, 'Correctly parses W3C traceparent header');

  // Test 4: OpenTelemetry Span Lifecycle
  const span = tracer.startSpan('HTTP GET /api/v1/telemetry/live', { 'http.method': 'GET', 'http.status_code': 200 });
  assert(span.traceId.length === 32, 'Span initialized with traceId');
  assert(span.status === 'UNSET', 'Initial span status is UNSET');

  await new Promise(resolve => setTimeout(resolve, 20));

  const endedSpan = tracer.endSpan(span, 'OK');
  assert(endedSpan.status === 'OK', 'Ended span status is OK');
  assert(typeof endedSpan.durationMs === 'number' && endedSpan.durationMs >= 15, 'Span records duration in milliseconds');

  // Test 5: SSE Connection Counter Tracking
  const conn1 = 'sse_test_conn_01';
  const conn2 = 'sse_test_conn_02';
  tracer.registerSseClient(conn1);
  tracer.registerSseClient(conn2);
  assert(tracer.getActiveSseCount() >= 2, 'Tracks active SSE client registrations');

  tracer.unregisterSseClient(conn1);
  tracer.unregisterSseClient(conn2);

  // Test 6: Queue Depth Metric Tracking
  tracer.setQueueDepth(12);
  assert(tracer.getQueueDepth() === 12, 'Accurately tracks message ingestion queue depth');
  tracer.setQueueDepth(0);

  // Test 7: Observability Metrics Registry
  const metrics = tracer.getMetrics();
  assert(typeof metrics.latencyMs.p50 === 'number', 'Calculates p50 latency metric');
  assert(typeof metrics.latencyMs.p95 === 'number', 'Calculates p95 latency metric');
  assert(typeof metrics.latencyMs.p99 === 'number', 'Calculates p99 latency metric');
  assert(typeof metrics.errorRatePercentage === 'number', 'Calculates request error rate percentage');

  // Test 8: Structured JSON Logger
  let capturedLog: string | null = null;
  const originalLog = console.log;
  console.log = (msg: string) => { capturedLog = msg; };

  logger.info('Test telemetry ingestion complete', { packetCount: 15 }, {
    requestId: 'req_test_123',
    traceId: 'trace_test_456',
    spanId: 'span_test_789',
    method: 'POST',
    url: '/api/v1/telemetry/simulate',
    headers: {},
    socket: {},
  } as any);

  console.log = originalLog;
  assert(capturedLog !== null, 'Structured logger outputs log message');
  const parsedLog = JSON.parse(capturedLog!);
  assert(parsedLog.service === 'kilowattiq-backend', 'Log contains service name');
  assert(parsedLog.request_id === 'req_test_123', 'Log contains correlated request_id');
  assert(parsedLog.trace_id === 'trace_test_456', 'Log contains correlated trace_id');

  // Test 9: Expanded Health Check Evaluator
  const healthEvaluator = HealthEvaluator.getInstance();
  const report = await healthEvaluator.evaluate();

  assert(report.subsystems.database !== undefined, 'Health report contains Database subsystem evaluation');
  assert(report.subsystems.redis !== undefined, 'Health report contains Redis subsystem evaluation');
  assert(report.subsystems.mqtt !== undefined, 'Health report contains MQTT subsystem evaluation');
  assert(report.subsystems.gemini !== undefined, 'Health report contains Gemini AI subsystem evaluation');
  assert(report.subsystems.paymentProviders !== undefined, 'Health report contains Payment Gateways evaluation');
  assert(report.subsystems.observability !== undefined, 'Health report contains Observability evaluation');
  assert(report.databaseStatus === 'connected' || report.databaseStatus === 'disconnected', 'Health report maintains backwards-compatible databaseStatus');
  assert(typeof report.metrics.activeSseClients === 'number', 'Health report includes active SSE clients metric');
  assert(typeof report.metrics.avgLatencyMs === 'number', 'Health report includes average request latency');

  console.log(`\n🎉 All ${passed}/${total} observability & tracing tests passed!`);
}

runObservabilityTests().catch(err => {
  console.error('Test runner failure:', err);
  process.exit(1);
});
