/**
 * PM2 Ecosystem Configuration
 * Used for production deployments with PM2 process manager
 * 
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 restart portal
 *   pm2 logs portal
 */

module.exports = {
  apps: [
    {
      // Application name
      name: 'portal',
      
      // Start script (uses Next.js built-in production server)
      script: 'node_modules/.bin/next',
      args: 'start',
      
      // Single instance — fork mode. On a small (512MB) droplet, cluster mode
      // with one worker per core would exhaust memory. Bump to 'max'/'cluster'
      // only on larger plans.
      instances: 1,
      exec_mode: 'fork',

      // Cap V8's heap so the Next server can't drift toward 1GB+ and push a
      // small droplet into swap/OOM — the cause of the multi-second page stalls.
      // Sized for the 1GB SGP box: 768MB heap leaves room for Postgres + the OS.
      // Drop back toward 320 on a 512MB box; raise toward 1536 on 2GB+.
      node_args: '--max-old-space-size=768',

      // Belt-and-suspenders: if RSS still climbs past this, pm2 recycles the
      // process gracefully instead of letting the kernel OOM-kill it (which
      // shows up as a hard stall). Keep above the heap cap + native overhead.
      max_memory_restart: '850M',

      // Environment variables
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      
      // Logging
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Auto-restart on file changes (disable in production if needed)
      watch: false,
      
      // Grace period before force kill
      kill_timeout: 5000,
      
      // Restart delay
      min_uptime: '10s',
      max_restarts: 10,
      autorestart: true,
    },
  ],
};
