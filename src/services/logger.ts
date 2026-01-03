import winston from 'winston';

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf((info) => {
    const { level, message, timestamp, stack, label } = info;
    const labelStr = label ? `[${label}] ` : '';
    if (stack) {
      return `[${timestamp}] ${level}: ${labelStr}${message}\n${stack}`;
    }
    return `[${timestamp}] ${level}: ${labelStr}${message}`;
  })
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
    }),
  ],
});

// Helper to create labeled logger for specific files
export function createLogger(label: string) {
  return logger.child({ label });
}