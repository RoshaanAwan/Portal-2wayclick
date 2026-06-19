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
