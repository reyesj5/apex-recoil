// The HTTP server: pnpm start, or pnpm dev (with --dev).

import fs from 'node:fs';
import http from 'node:http';

/**
 * Optional settings from .env in the working directory (see .env.example).
 */

if (fs.existsSync('.env')) process.loadEnvFile('.env');

/**
 * --dev (pnpm dev): Vite serves the client sources with hot reload (see routes/pages.ts). It also
 * serves project files, so the development server only listens on this computer.
 */

const devMode = process.argv.includes('--dev') || process.env.RECOIL_VITE_DEV === '1';

/**
 * The app, loaded after .env so it sees its values.
 */

const { createApp } = await import('./app.ts');
const app = await createApp({ dev: devMode });

/**
 * Get port from environment and store in Express.
 */

let port = normalizePort(process.env.PORT || '3000');
app.set('port', port);

/**
 * Create HTTP server.
 */

const server = http.createServer(app);

/**
 * Listen on provided port, on all network interfaces (only this computer with --dev).
 */

const host = devMode ? '127.0.0.1' : undefined;
const listen = () => (typeof port === 'number' ? server.listen(port, host) : server.listen(port));
listen();
server.on('error', onError);
server.on('listening', onListening);

/**
 * Normalize a port into a number, or a string for a named pipe.
 */

function normalizePort(val: string): number | string {
  const port = parseInt(val, 10);

  if (isNaN(port)) {
    // named pipe
    return val;
  }

  if (port >= 0) {
    // port number
    return port;
  }

  console.error(`PORT must be a port number or a pipe name, not ${val}`);
  process.exit(1);
}

/**
 * Event listener for HTTP server "error" event.
 */

function onError(error: NodeJS.ErrnoException) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  const bind = typeof port === 'string' ? 'Pipe ' + port : 'Port ' + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      if (!process.env.PORT && typeof port === 'number' && port < 3010) {
        console.warn(bind + ' is already in use. Retrying on port ' + (port + 1) + '...');
        port++;
        app.set('port', port);
        setTimeout(listen, 100);
        return;
      }
      console.error(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
}

/**
 * Event listener for HTTP server "listening" event.
 */

function onListening() {
  const addr = server.address();
  const where = typeof addr === 'string' ? 'pipe ' + addr : 'http://localhost:' + addr!.port;
  console.log(app.locals.site.name + ' server running at ' + where + (devMode ? ' (development, hot reload)' : ''));
}
