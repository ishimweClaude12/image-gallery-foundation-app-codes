import './env.js';
import { createApp } from './app.js';
import { initDb } from './db.js';

const port = Number(process.env.PORT); // No fallback to 3000, since we want to fail if PORT is not set. This is a requirement for the AWS Elastic Beanstalk environment.

async function start() {
  try {
    await initDb();
    console.log('Database ready');
  } catch (err) {
    // Start the server anyway so /health passes while RDS becomes reachable.
    // The gallery routes will report errors until the database is available.
    console.error('Database init failed, starting server regardless:', err.message);
  }

  const app = createApp();
  app.listen(port, () => console.log(`Kivu Gallery listening on port ${port}`));
}

start();
