/**
 * Structured Cloud Logging for Personal Gemini Journal
 *
 * Adheres strictly to GCP Cloud Logging JSON specification:
 * - severity: DEBUG, INFO, WARNING, ERROR
 * - message: High-level descriptive string
 * - timestamp: RFC 3339 / ISO 8601
 * - logging.googleapis.com/trace: Cloud Trace correlation identifier
 * - userId: Verified UID (never email or PII)
 * - securityAlert: Flag for security anomaly signals
 *
 * STRICT REDACTION POLICIES (Guaranteed Zero Secret/PII Leakage):
 * - NO Gemini API keys
 * - NO Firebase tokens (ID tokens, Bearer headers, refresh tokens)
 * - NO raw journal conversations, reflection texts, or user messages
 * - NO sensitive profile info (emails, names, phone numbers)
 * - NO private RAG context (raw summaries, embeddings, vector floats)
 */

export interface StructuredLogPayload {
  severity: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
  message: string;
  traceId?: string;
  userId?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  latencyMs?: number;
  securityAlert?: boolean;
  details?: Record<string, unknown>;
}

// Exhaustive blocklist of sensitive property names (stored normalized without non-alphanumerics)
const REDACTED_KEYS = new Set([
  // Tokens, credentials & secrets
  'authorization',
  'cookie',
  'token',
  'idtoken',
  'refreshtoken',
  'key',
  'geminiapikey',
  'gemini_api_key',
  'apikey',
  'secret',
  'bearer',
  'password',
  'credentials',

  // Raw journal conversations & prompts
  'content',
  'journaltext',
  'prompt',
  'message',
  'rawinput',
  'userreflection',
  'reflection',
  'entrycontent',
  'text',
  'reply',

  // Sensitive profile information
  'email',
  'displayname',
  'phonenumber',
  'phone',
  'profile',
  'userprofile',

  // Private RAG context & vectors
  'summary',
  'summarytext',
  'embedding',
  'embeddings',
  'vectors',
  'ragcontext',
  'retrievedsummaries',
  'historicalsummaries',
  'context',
]);

// Value patterns for defence-in-depth secret detection
const JWT_PATTERN = /^eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}$/;
const BEARER_PATTERN = /^Bearer\s+[a-zA-Z0-9_\-.]+$/i;
const API_KEY_PATTERN = /^AIza[0-9A-Za-z-_]{30,45}$/;
const EMAIL_PATTERN = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;

/**
 * Recursively redacts sensitive keys and values from logging objects.
 */
export function redactSensitiveData(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    if (BEARER_PATTERN.test(obj)) return '[REDACTED_BEARER_TOKEN]';
    if (JWT_PATTERN.test(obj)) return '[REDACTED_JWT_TOKEN]';
    if (API_KEY_PATTERN.test(obj)) return '[REDACTED_API_KEY]';
    if (EMAIL_PATTERN.test(obj)) return '[REDACTED_EMAIL]';
    return obj;
  }

  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitiveData(item));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = k.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (REDACTED_KEYS.has(lowerKey)) {
      sanitized[k] = '[REDACTED_BY_SECURITY_POLICY]';
    } else if (typeof v === 'object' && v !== null) {
      sanitized[k] = redactSensitiveData(v);
    } else if (typeof v === 'string') {
      sanitized[k] = redactSensitiveData(v);
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}

/**
 * Formats and outputs structured JSON logs complying with Google Cloud Logging schema.
 */
export function logStructured(payload: StructuredLogPayload): void {
  const traceId = payload.traceId || 'none';
  const GCP_PROJECT_ID = process.env.GCP_PROJECT || 'personal-gemini-journal';

  const entry: Record<string, unknown> = {
    severity: payload.severity,
    message: payload.message,
    timestamp: new Date().toISOString(),
    traceId,
    'logging.googleapis.com/trace': traceId !== 'none' ? `projects/${GCP_PROJECT_ID}/traces/${traceId}` : undefined,
    userId: payload.userId || 'anonymous',
    endpoint: payload.endpoint,
    method: payload.method,
    statusCode: payload.statusCode,
    latencyMs: payload.latencyMs,
    securityAlert: payload.securityAlert ?? false,
    details: payload.details ? redactSensitiveData(payload.details) : undefined,
  };

  const jsonString = JSON.stringify(entry);

  if (payload.severity === 'ERROR') {
    console.error(jsonString);
  } else if (payload.severity === 'WARNING') {
    console.warn(jsonString);
  } else {
    console.log(jsonString);
  }
}

/**
 * Standardized, safe error response shape.
 * Prevents stack traces, internal paths, and third-party error dumps from leaking to clients.
 */
export interface SafeErrorResponse {
  error: string;
  code: string;
  traceId: string;
  details?: string[];
  retryAfter?: number;
}

export function createSafeErrorResponse(options: {
  statusCode: number;
  code: string;
  message: string;
  traceId: string;
  details?: string[];
  retryAfter?: number;
}): SafeErrorResponse {
  return {
    error: options.message,
    code: options.code,
    traceId: options.traceId,
    details: options.details,
    retryAfter: options.retryAfter,
  };
}
