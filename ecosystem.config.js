module.exports = {
  apps: [
    {
      name: "candiq-ai",
      script: "./dist/index.cjs",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 5000,
      },
      // Logging
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      log_file: "./logs/pm2-combined.log",
      time: true,
      
      // Auto restart
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      
      // Memory management
      max_memory_restart: "1G",
      
      // Watch mode (disable in production)
      watch: false,
      
      // Environment variables (override with .env file)
      env_file: ".env",
    },
  ],
};
