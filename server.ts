/**
 * Personal Gemini Journal - Cloud Run Backend Server
 *
 * Implements:
 * - Express HTTP server binding to 0.0.0.0:3000
 * - Request correlation tracing (X-Cloud-Trace-Context / X-Request-ID)
 * - Standardized security headers & strict JSON payload limits
 * - Cloud Run health probes (/api/health)
 * - Firebase Authentication & UID-isolated API routes (/api/*)
 * - Development Vite middleware & Production static serving
 * - Fail-closed global error handling with safe responses
 */
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { randomUUID } from 'crypto';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './server/routes';
import { logStructured, createSafeErrorResponse } from './server/logger';

const PORT = 3000;
const HOST = '0.0.0.0';

async function startServer() {
  const app = express();

  // Security: Payload size limits to prevent Denial of Service (DoS)
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Security Headers & Request Tracing Middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const incomingTrace =
      (req.headers['x-cloud-trace-context'] as string | undefined) ||
      (req.headers['x-request-id'] as string | undefined);
    const traceId = incomingTrace ? incomingTrace.split('/')[0] : randomUUID();
    (req as any).traceId = traceId;

    // Standard correlation headers
    res.setHeader('X-Trace-ID', traceId);
    res.setHeader('X-Request-ID', traceId);

    // Baseline security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    next();
  });

  // Health Check for Cloud Run Readiness and Liveness Probes
  app.get('/api/health', (req: Request, res: Response) => {
    const traceId = (req as any).traceId || 'none';
    res.status(200).json({
      status: 'healthy',
      service: 'personal-gemini-journal-backend',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      traceId,
    });
  });

  // Mount Authenticated API Endpoints
  app.use('/api', apiRouter);

  // Development vs Production Asset Serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global Fail-Closed Error Handler
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const traceId = (req as any).traceId || 'unknown';
    logStructured({
      severity: 'ERROR',
      message: 'Unhandled server error in request pipeline',
      traceId,
      endpoint: req.originalUrl,
      method: req.method,
      statusCode: 500,
      details: {
        errorName: err?.name,
        errorMessage: err?.message,
      },
    });

    const safeError = createSafeErrorResponse({
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred. Please try again later.',
      traceId,
    });

    res.status(500).json(safeError);
  });

  const server = app.listen(PORT, HOST, () => {
    logStructured({
      severity: 'INFO',
      message: `Personal Gemini Journal backend listening on http://${HOST}:${PORT}`,
      details: { environment: process.env.NODE_ENV || 'development' },
    });
  });

  // Graceful shutdown for Cloud Run container lifecycle
  const handleShutdown = (signal: string) => {
    logStructured({
      severity: 'INFO',
      message: `Received ${signal}. Gracefully shutting down...`,
    });
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

startServer().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
