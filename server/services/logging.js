// Optional Sentry integration. Install `@sentry/node` and set SENTRY_DSN in .env to enable.
let sentry = null;
if(process.env.SENTRY_DSN){
  try{
    const Sentry = require('@sentry/node');
    Sentry.init({ dsn: process.env.SENTRY_DSN });
    sentry = Sentry;
    console.log('Sentry initialized');
    Sentry.captureMessage('Sentry initialized for AI workspace');
  }catch(e){ console.warn('Sentry not installed or failed to initialize:', e.message || e); }
}

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  if(sentry && sentry.captureException) sentry.captureException(err);
});
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  if(sentry && sentry.captureException) sentry.captureException(err);
});

module.exports = { sentry };
