#!/bin/bash
# 影视网站部署脚本

echo "========================================"
echo "  影视爆米花网站部署脚本"
echo "========================================"
echo ""

# 设置变量
DOMAIN="your-domain.com"  # 替换为你的域名
SERVER_IP="your-server-ip"  # 替换为你的服务器IP
PROJECT_DIR="/www/wwwroot/movie-site"

echo "步骤 1: 创建项目目录..."
mkdir -p $PROJECT_DIR
cd $PROJECT_DIR

echo "步骤 2: 克隆代码..."
git clone https://github.com/lorryjovens-hub/-2574.git .

echo "步骤 3: 安装依赖..."
npm install

echo "步骤 4: 创建数据目录..."
mkdir -p data

echo "步骤 5: 设置权限..."
chmod -R 755 $PROJECT_DIR
chown -R www:www $PROJECT_DIR

echo ""
echo "========================================"
echo "  部署完成!"
echo "========================================"
echo ""
echo "接下来请在宝塔面板中:"
echo "1. 添加 Node 项目"
echo "2. 设置反向代理到 Nginx"
echo "3. 配置域名"
