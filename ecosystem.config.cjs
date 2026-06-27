module.exports = {
  apps: [
    {
      name: 'chatgpt2api-backend',
      script: '/root/.local/bin/uv',
      args: 'run main.py',
      cwd: '/root/chatgpt2api-proxy-pool',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        PATH: process.env.PATH + ':/root/.local/bin',
      },
      error_file: '/root/chatgpt2api-proxy-pool/logs/backend-error.log',
      out_file: '/root/chatgpt2api-proxy-pool/logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
    },
    {
      name: 'chatgpt2api-frontend',
      script: '/root/.bun/bin/bunx',
      args: 'serve out -l 3002 -s',
      cwd: '/root/chatgpt2api-proxy-pool/web',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/root/chatgpt2api-proxy-pool/logs/frontend-error.log',
      out_file: '/root/chatgpt2api-proxy-pool/logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
};
