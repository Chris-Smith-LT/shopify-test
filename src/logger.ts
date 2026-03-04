import pino from 'pino';
import { config } from './config';

// Structured JSON logger — outputs JSON lines readable by CloudWatch and Azure Monitor.
// Each log entry includes: level, time, pid, hostname, and any fields passed as the first argument.
// Example: logger.info({ origin: '44114', dest: '90210', elapsed: 42 }, 'Returning rates')
export const logger = pino({ level: config.logLevel });
