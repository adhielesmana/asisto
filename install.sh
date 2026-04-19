#!/usr/bin/env bash
set -euo pipefail

echo "Updating system..."
dnf update -y

echo "Installing dependencies..."
dnf install -y docker docker-compose nginx git curl

systemctl enable docker
systemctl start docker

echo "Configuring Nginx for asisto.maxnetplus.id..."

cat > /etc/nginx/conf.d/asisto.conf <<EOL
server {
    server_name asisto.maxnetplus.id;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host \$host;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /api/ {
        proxy_pass http://localhost:4000/;
    }
}
EOL

systemctl enable nginx
systemctl restart nginx

if [ ! -f .env ] && [ -f .env.example ]; then
    cp .env.example .env
    echo "Created .env from .env.example"
fi

echo "Pulling the latest Ollama runtime image..."
docker-compose pull ollama

echo "Starting Ollama container..."
docker-compose up -d ollama

echo "Creating asisto-coder and pulling the Ollama action model inside Docker..."
COMPOSE_PROFILES=init docker-compose run --rm ollama-init

echo "Starting ASISTO stack..."
docker-compose up -d --build backend frontend prometheus grafana

echo "ASISTO deployed successfully!"
echo "Frontend: https://asisto.maxnetplus.id"
echo "Backend API: https://asisto.maxnetplus.id/api"
echo "Ollama: internal Docker service only"
echo "Prometheus: http://server-ip:9090"
echo "Grafana: http://server-ip:3301 (admin/admin)"
