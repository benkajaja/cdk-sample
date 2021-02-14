#!/bin/bash
sysctl -w vm.max_map_count=524288
sysctl -w fs.file-max=131072
sh -c "echo 'vm.max_map_count=524288' >> /etc/sysctl.conf"
sh -c "echo 'fs.file-max=131072' >> /etc/sysctl.conf"
sysctl -p
sh -c "echo \"OPTIONS='--default-ulimit nofile=131072:131072'\" >> /etc/sysconfig/docker"
yum install docker -y
systemctl start docker
usermod -aG docker ec2-user
usermod -aG docker ssm-user
chmod +x /var/run/docker.sock
systemctl restart docker && systemctl enable docker
curl -L https://github.com/docker/compose/releases/download/1.22.0/docker-compose-$(uname -s)-$(uname -m) -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

cd ~
echo 'version: "3"
services:
  sonarqube:
    image: sonarqube:8-community
    depends_on:
      - db
    environment:
      SONAR_JDBC_URL: jdbc:postgresql://db:5432/sonar
      SONAR_JDBC_USERNAME: sonar
      SONAR_JDBC_PASSWORD: sonar
    volumes:
      - /opt/sonarqube/sonarqube_data:/opt/sonarqube/data
      - /opt/sonarqube/sonarqube_extensions:/opt/sonarqube/extensions
      - /opt/sonarqube/sonarqube_logs:/opt/sonarqube/logs
      - /opt/sonarqube/sonarqube_temp:/opt/sonarqube/temp
    ports:
      - "9000:9000"
  db:
    image: postgres:12
    environment:
      POSTGRES_USER: sonar
      POSTGRES_PASSWORD: sonar
    volumes:
      - /opt/postgresql/postgresql:/var/lib/postgresql
      - /opt/postgresql/postgresql_data:/var/lib/postgresql/data

' > docker-compose.yml

docker-compose up -d