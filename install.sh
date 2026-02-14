#!/bin/bash

echo "Updating system..."
dnf update -y

echo "Installing dependencies..."
dnf install -y docker docker-compose nginx git curl

systemctl enable docker
systemctl start docker

echo "Installing Ollama..."
curl -fsSL https://ollama.com/install.sh | sh
systemctl enable ollama
systemctl start ollama

echo "Pulling llama3 model..."
ollama pull llama3

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

echo "Starting ASISTO stack..."
docker-compose up -d --build

echo "ASISTO deployed successfully!"
echo "Frontend: https://asisto.maxnetplus.id"
echo "Backend API: https://asisto.maxnetplus.id/api"
echo "Prometheus: http://server-ip:9090"
echo "Grafana: http://server-ip:3001 (admin/admin)"
