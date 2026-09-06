/**
 * Request Validation Schemas using Zod
 *
 * Enforces strict input validation, length constraints, and schema bounds.
 * Prevents parameter pollution, buffer overflows, and injection attacks.
 * Integrates real-time abuse detection scanning for prompt injection patterns.
 */
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { logStructured, createSafeErrorResponse } from './logger';
import { inspectForPromptInjection, recordAbuseSignal } from './abuseDetector';

export const ChatRequestSchema = z.object({
  message: z.string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(4000, 'Message cannot exceed 4000 characters'),

  conversationId: z.string()
    .max(128, 'Conversation ID cannot exceed 128 characters')
    .regex(/^[a-zA-Z0-9_\-]+$/, 'Invalid conversation ID format')
    .optional(),
}).strict();

export const SummarizeRequestSchema = z.object({
  content: z.string()
    .trim()
    .min(1, 'Journal content cannot be empty')
    .max(25000, 'Journal content cannot exceed 25,000 characters'),

  title: z.string()
    .trim()
    .max(150, 'Title cannot exceed 150 characters')
    .optional(),

  mood: z.string()
    .trim()
    .max(50, 'Mood cannot exceed 50 characters')
    .optional(),

  tags: z.array(z.string().trim().max(30))
    .max(10, 'Maximum 10 tags allowed')
    .optional(),
}).strict();

export const HistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(['entries', 'summaries', 'conversations', 'all']).default('all'),
});

export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const traceId = (req as any).traceId || 'none';
    const user = (req as any).user;

    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issues = (result.error as any).issues || (result.error as any).errors || [];
      const safeErrorDetails = issues.map((e: any) => {
        const field = Array.isArray(e.path) && e.path.length > 0 ? `${e.path.join('.')}: ` : '';
        return `${field}${e.message}`;
      });

      logStructured({
        severity: 'WARNING',
        message: 'Schema validation failed for request body',
        traceId,
        userId: user?.uid,
        endpoint: req.originalUrl,
        method: req.method,
        statusCode: 400,
        details: {
          fieldCount: safeErrorDetails.length,
          fields: issues.map((e: any) => Array.isArray(e.path) ? e.path.join('.') : ''),
        },
      });

      const responsePayload = createSafeErrorResponse({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload. Please verify required fields and length constraints.',
        traceId,
        details: safeErrorDetails,
      });

      res.status(400).json(responsePayload);
      return;
    }

    req.body = result.data;

    // Abuse detection: Inspect incoming message or content fields for injection markers
    const textToScan = req.body.message || req.body.content;
    if (typeof textToScan === 'string') {
      const injectionScan = inspectForPromptInjection(textToScan);
      if (injectionScan.isSuspicious) {
        recordAbuseSignal({
          type: 'PROMPT_INJECTION_DETECTED',
          userId: user?.uid,
          traceId,
          endpoint: req.originalUrl,
          details: {
            detectedSignatures: injectionScan.matchedPatterns,
            inputLength: textToScan.length,
          },
        });
      }
    }

    next();
  };
}

export function validateQuery<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const traceId = (req as any).traceId || 'none';
    const user = (req as any).user;

    const result = schema.safeParse(req.query);
    if (!result.success) {
      const issues = (result.error as any).issues || (result.error as any).errors || [];
      const safeErrorDetails = issues.map((e: any) => {
        const field = Array.isArray(e.path) && e.path.length > 0 ? `${e.path.join('.')}: ` : '';
        return `${field}${e.message}`;
      });

      logStructured({
        severity: 'WARNING',
        message: 'Schema validation failed for query parameters',
        traceId,
        userId: user?.uid,
        endpoint: req.originalUrl,
        method: req.method,
        statusCode: 400,
        details: {
          fieldCount: safeErrorDetails.length,
          fields: issues.map((e: any) => Array.isArray(e.path) ? e.path.join('.') : ''),
        },
      });

      const responsePayload = createSafeErrorResponse({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Invalid query parameters.',
        traceId,
        details: safeErrorDetails,
      });

      res.status(400).json(responsePayload);
      return;
    }

    (req as any).validatedQuery = result.data;
    next();
  };
}
