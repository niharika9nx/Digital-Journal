/**
 * Per-UID Sliding Window Rate Limiter
 *
 * Enforces per-user quotas bound to cryptographically verified UIDs.
 * Defends against Denial of Wallet (DoW) attacks, API flooding, and quota exhaustion.
 *
 * Standards-compliant response headers:
 * - X-RateLimit-Limit: Total allowed requests in the window
 * - X-RateLimit-Remaining: Number of requests left in current window
 * - X-RateLimit-Reset: Unix timestamp when the window clears
 * - Retry-After: Seconds to wait before retrying (when 429)
 */
import type { Request, Response, NextFunction } from 'express';
import { logStructured, createSafeErrorResponse } from './logger';
import { checkRateLimitAbuse } from './abuseDetector';

interface RateLimitRecord {
  timestamps: number[];
}

export class RateLimiterStore {
  private records: Map<string, RateLimitRecord> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Purge idle records older than 15 minutes
    this.cleanupInterval = setInterval(() => {
      const cutoff = Date.now() - 15 * 60 * 1000;
      for (const [key, record] of this.records.entries()) {
        record.timestamps = record.timestamps.filter(ts => ts > cutoff);
        if (record.timestamps.length === 0) {
          this.records.delete(key);
        }
      }
    }, 5 * 60 * 1000);

    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  isAllowed(
    key: string,
    maxRequests: number,
    windowMs: number
  ): { allowed: boolean; remaining: number; resetTimestamp: number; retryAfterSeconds: number } {
    const now = Date.now();
    const windowStart = now - windowMs;

    let record = this.records.get(key);
    if (!record) {
      record = { timestamps: [] };
      this.records.set(key, record);
    }

    // Filter to timestamps strictly in the active sliding window
    record.timestamps = record.timestamps.filter(ts => ts > windowStart);

    if (record.timestamps.length >= maxRequests) {
      const oldestInWindow = record.timestamps[0];
      const resetTimestamp = Math.ceil((oldestInWindow + windowMs) / 1000);
      const retryAfterSeconds = Math.max(1, Math.ceil((oldestInWindow + windowMs - now) / 1000));
      return { allowed: false, remaining: 0, resetTimestamp, retryAfterSeconds };
    }

    record.timestamps.push(now);
    const resetTimestamp = Math.ceil((now + windowMs) / 1000);

    return {
      allowed: true,
      remaining: maxRequests - record.timestamps.length,
      resetTimestamp,
      retryAfterSeconds: 0,
    };
  }

  _clearForTesting(): void {
    this.records.clear();
  }
}

export const rateLimiterStore = new RateLimiterStore();

export interface RateLimiterOptions {
  maxRequests: number;
  windowMs: number;
  endpointName: string;
}

export function createRateLimiter(options: RateLimiterOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Primary key: Verified UID. Fallback: Client IP
    const user = (req as any).user;
    const traceId = (req as any).traceId || 'none';
    const rateLimitKey = user?.uid
      ? `uid:${user.uid}:${options.endpointName}`
      : `ip:${req.ip}:${options.endpointName}`;

    const result = rateLimiterStore.isAllowed(rateLimitKey, options.maxRequests, options.windowMs);

    res.setHeader('X-RateLimit-Limit', options.maxRequests);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', result.resetTimestamp);

    if (!result.allowed) {
      res.setHeader('Retry-After', result.retryAfterSeconds);

      // Check if this violation constitutes an aggressive burst abuse signal
      checkRateLimitAbuse(rateLimitKey, user?.uid, traceId, req.originalUrl);

      logStructured({
        severity: 'WARNING',
        message: `Rate limit exceeded on ${options.endpointName}`,
        traceId,
        userId: user?.uid,
        endpoint: req.originalUrl,
        method: req.method,
        statusCode: 429,
        details: {
          retryAfterSeconds: result.retryAfterSeconds,
          limit: options.maxRequests,
          windowMs: options.windowMs,
          endpoint: options.endpointName,
        },
      });

      const errorPayload = createSafeErrorResponse({
        statusCode: 429,
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit exceeded. You may only make ${options.maxRequests} requests per minute for this service. Please retry in ${result.retryAfterSeconds}s.`,
        traceId,
        retryAfter: result.retryAfterSeconds,
      });

      res.status(429).json(errorPayload);
      return;
    }

    next();
  };
}
