/**
 * Abuse Detection & Anomaly Signal Engine
 *
 * Detects, tracks, and flags security anomalies:
 * 1. Prompt injection / jailbreak patterns
 * 2. Rate limit threshold abuse & DoW bursts
 * 3. Identity spoofing / UID injection
 * 4. Cross-tenant tampering attempts
 * 5. High-entropy / malformed payload anomalies
 */
import { logStructured } from './logger';

export type AbuseSignalType =
  | 'PROMPT_INJECTION_DETECTED'
  | 'DELIMITER_BREAKOUT_ATTEMPT'
  | 'RATE_LIMIT_ABUSE'
  | 'IDENTITY_SPOOFING_ATTEMPT'
  | 'CROSS_TENANT_ACCESS_ATTEMPT'
  | 'MALFORMED_PAYLOAD_ANOMALY';

export interface AbuseSignal {
  type: AbuseSignalType;
  userId?: string;
  traceId?: string;
  endpoint?: string;
  ip?: string;
  details?: Record<string, unknown>;
}

interface WindowTracker {
  timestamps: number[];
}

class AbuseTracker {
  private rateLimitAbuseMap: Map<string, WindowTracker> = new Map();
  private cleanupTimer: NodeJS.Timeout;

  constructor() {
    this.cleanupTimer = setInterval(() => {
      const cutoff = Date.now() - 5 * 60 * 1000;
      for (const [key, tracker] of this.rateLimitAbuseMap.entries()) {
        tracker.timestamps = tracker.timestamps.filter(ts => ts > cutoff);
        if (tracker.timestamps.length === 0) {
          this.rateLimitAbuseMap.delete(key);
        }
      }
    }, 60 * 1000);

    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Tracks repeated rate limit rejections and flags abuse when threshold is exceeded.
   */
  recordRateLimitViolation(key: string, limit = 3, windowMs = 60 * 1000): { isAbusive: boolean; violationCount: number } {
    const now = Date.now();
    let tracker = this.rateLimitAbuseMap.get(key);
    if (!tracker) {
      tracker = { timestamps: [] };
      this.rateLimitAbuseMap.set(key, tracker);
    }

    tracker.timestamps = tracker.timestamps.filter(ts => ts > now - windowMs);
    tracker.timestamps.push(now);

    const violationCount = tracker.timestamps.length;
    const isAbusive = violationCount >= limit;
    return { isAbusive, violationCount };
  }
}

const abuseTracker = new AbuseTracker();

// Known prompt injection / jailbreak markers & adversarial phrases
const PROMPT_INJECTION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /<\/?(?:journal_context|user_reflection|system_instruction|developer_instructions?)/i, label: 'delimiter_tag_breakout' },
  { pattern: /\b(?:ignore|disregard|bypass)\s+(?:all\s+)?(?:previous|prior|system|developer)\s+(?:instructions|rules|prompts)\b/i, label: 'ignore_instructions' },
  { pattern: /\b(?:system\s*override|enter\s*developer\s*mode|enable\s*unrestricted\s*mode)\b/i, label: 'mode_override' },
  { pattern: /\b(?:you\s+are\s+now|roleplay\s+as)\s+(?:dan|root|admin|developer|unfiltered)\b/i, label: 'persona_hijack' },
  { pattern: /\b(?:print|reveal|show|leak|repeat)\s+(?:system\s+instructions?|developer\s+prompt|core\s+prompt)\b/i, label: 'prompt_leak_request' },
  { pattern: /\bbase64\s*(?:decode|eval)\b/i, label: 'obfuscated_eval' },
];

/**
 * Scans input text for adversarial prompt injection indicators.
 * Does NOT log the text itself; only flags pattern labels and match counts.
 */
export function inspectForPromptInjection(text: string): { isSuspicious: boolean; matchedPatterns: string[] } {
  if (!text || typeof text !== 'string') {
    return { isSuspicious: false, matchedPatterns: [] };
  }

  const matches: string[] = [];
  for (const { pattern, label } of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      matches.push(label);
    }
  }

  return {
    isSuspicious: matches.length > 0,
    matchedPatterns: matches,
  };
}

/**
 * Records and emits a high-priority structured security alert.
 */
export function recordAbuseSignal(signal: AbuseSignal): void {
  logStructured({
    severity: signal.type === 'RATE_LIMIT_ABUSE' ? 'WARNING' : 'ERROR',
    message: `Security Anomaly Signal: ${signal.type}`,
    traceId: signal.traceId,
    userId: signal.userId,
    endpoint: signal.endpoint,
    statusCode: signal.type === 'RATE_LIMIT_ABUSE' ? 429 : 400,
    securityAlert: true,
    details: {
      alertType: signal.type,
      ...signal.details,
    },
  });
}

/**
 * Tracks rate limit breaches and emits abuse alert if burst threshold reached.
 */
export function checkRateLimitAbuse(
  key: string,
  userId?: string,
  traceId?: string,
  endpoint?: string
): { isAbusive: boolean; count: number } {
  const result = abuseTracker.recordRateLimitViolation(key, 4, 60 * 1000);
  if (result.isAbusive) {
    recordAbuseSignal({
      type: 'RATE_LIMIT_ABUSE',
      userId,
      traceId,
      endpoint,
      details: {
        violationCount: result.violationCount,
        rateLimitKey: key,
        threshold: 4,
        windowMs: 60000,
      },
    });
  }
  return { isAbusive: result.isAbusive, count: result.violationCount };
}
