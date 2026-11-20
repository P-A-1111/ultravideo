module.exports = {
  apps: [
    {
      name: "u-api",
      cwd: "/var/www/u-api",
      script: "api/server.mjs",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: "3101",
        FLY_ORIGIN: "https://fly.palv.org",
      },
      max_memory_restart: "600M",
      out_file: "/var/www/u-api/logs/pm2-out.log",
      error_file: "/var/www/u-api/logs/pm2-error.log",
      merge_logs: true,
      time: true,
    },
  ],
};
