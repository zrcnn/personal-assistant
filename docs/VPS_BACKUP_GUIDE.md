# VPS 视频爬虫代理 - 部署与备份指南

## 服务概述

VPS 上的视频爬虫代理服务，用于访问外网视频网站。

## 当前配置

- **位置**: `/opt/video-crawler-proxy/`
- **端口**: 3002
- **服务名**: `video-crawler-proxy.service`
- **防火墙**: UFW 开放 3002/tcp

## 完整备份

### 1. 服务文件备份

```bash
# 创建备份目录
mkdir -p /opt/backups/video-crawler-proxy/$(date +%Y%m%d)

# 备份服务代码
cp -r /opt/video-crawler-proxy/ /opt/backups/video-crawler-proxy/$(date +%Y%m%d)/

# 备份 systemd 服务配置
cp /etc/systemd/system/video-crawler-proxy.service /opt/backups/video-crawler-proxy/$(date +%Y%m%d)/

# 备份防火墙规则
ufw status > /opt/backups/video-crawler-proxy/$(date +%Y%m%d)/firewall-rules.txt

# 创建备份清单
cat > /opt/backups/video-crawler-proxy/$(date +%Y%m%d)/MANIFEST.md << 'EOF'
# 视频爬虫代理备份清单

日期: $(date +%Y-%m-%d)

包含文件:
- server.js - 主服务代码
- video-crawler-proxy.service - systemd 配置
- firewall-rules.txt - 防火墙规则

部署说明:
1. 复制 server.js 到新服务器 /opt/video-crawler-proxy/
2. 复制 video-crawler-proxy.service 到 /etc/systemd/system/
3. 运行: systemctl daemon-reload
4. 运行: systemctl enable video-crawler-proxy
5. 运行: systemctl start video-crawler-proxy
6. 开放防火墙: ufw allow 3002/tcp
EOF

echo "✅ 备份完成: /opt/backups/video-crawler-proxy/$(date +%Y%m%d)/"
```

### 2. 一键部署脚本

创建 `deploy.sh`：

```bash
#!/bin/bash
# 视频爬虫代理 - 一键部署脚本

set -e

PORT=${1:-3002}
SERVICE_NAME="video-crawler-proxy"

echo "🚀 开始部署视频爬虫代理..."

# 1. 创建目录
mkdir -p /opt/$SERVICE_NAME
cd /opt/$SERVICE_NAME

# 2. 创建服务代码
cat > server.js << 'SERVEREOF'
const http = require('http');
const https = require('https');
const url = require('url');

const PORT = process.env.PORT || 3002;

const VIDEO_SITES = {
  bdys: { name: '哔嘀影视', domain: 'www.bdys.com', searchPath: '/search?q=' },
  ddys: { name: '低端影视', domain: 'ddys.tv', searchPath: '/?s=' },
  dmzj: { name: '动漫岛', domain: 'www.dmzj.com', searchPath: '/search?keywords=' },
  '555dy': { name: '555电影', domain: '555dy.com', searchPath: '/vod/search.html?wd=' },
  archive: { name: 'Archive.org', domain: 'archive.org', searchPath: '/search.php?query=' }
};

function proxyRequest(targetUrl, res) {
  const parsed = url.parse(targetUrl);
  const client = parsed.protocol === 'https:' ? https : http;
  
  const options = {
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.path,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
    },
    timeout: 15000
  };
  
  const req = client.request(options, function(proxyRes) {
    let data = '';
    proxyRes.on('data', function(chunk) { data += chunk; });
    proxyRes.on('end', function() {
      res.writeHead(proxyRes.statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
  });
  
  req.on('error', function(e) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: e.message }));
  });
  
  req.on('timeout', function() {
    req.destroy();
    res.writeHead(504);
    res.end(JSON.stringify({ error: 'Request timeout' }));
  });
  
  req.end();
}

const server = http.createServer(function(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const action = parsedUrl.pathname.split('/')[1];
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  if (action === 'fetch') {
    const target = parsedUrl.query.url;
    if (!target) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Missing URL parameter' }));
      return;
    }
    proxyRequest(target, res);
  } else if (action === 'search') {
    const query = parsedUrl.query.q || '';
    const site = parsedUrl.query.site || '';
    const siteInfo = VIDEO_SITES[site];
    
    if (!siteInfo) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Unknown site: ' + site }));
      return;
    }
    
    const searchUrl = 'https://' + siteInfo.domain + siteInfo.searchPath + encodeURIComponent(query);
    proxyRequest(searchUrl, res);
  } else if (action === 'sites') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ sites: VIDEO_SITES, port: PORT }));
  } else {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok',
      version: '2.0',
      endpoints: ['/fetch?url=', '/search?q=&site=', '/sites']
    }));
  }
});

server.listen(PORT, '0.0.0.0', function() {
  console.log('Video crawler proxy running on port ' + PORT);
});
SERVEREOF

# 3. 创建 systemd 服务
cat > /etc/systemd/system/$SERVICE_NAME.service << SVCEOF
[Unit]
Description=Video Crawler Proxy
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/$SERVICE_NAME
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=PORT=$PORT

[Install]
WantedBy=multi-user.target
SVCEOF

# 4. 启动服务
systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl start $SERVICE_NAME

# 5. 配置防火墙
ufw allow $PORT/tcp

# 6. 验证
sleep 2
if systemctl is-active --quiet $SERVICE_NAME; then
    echo "✅ 部署成功！服务运行在端口 $PORT"
    curl -s http://localhost:$PORT/ | head -100
else
    echo "❌ 部署失败，请检查日志"
    journalctl -u $SERVICE_NAME -n 20
fi
```

### 3. 迁移检查清单

```bash
#!/bin/bash
# 迁移检查清单

echo "=== VPS 迁移检查清单 ==="
echo ""

# 检查 Node.js
echo "1. Node.js 版本:"
node --version

# 检查服务
echo ""
echo "2. 服务状态:"
systemctl status video-crawler-proxy --no-pager | head -3

# 检查端口
echo ""
echo "3. 端口监听:"
netstat -tlnp | grep 3002

# 检查防火墙
echo ""
echo "4. 防火墙规则:"
ufw status | grep 3002

# 测试服务
echo ""
echo "5. 服务测试:"
curl -s http://localhost:3002/ && echo "✅ 服务正常"

# 测试代理
echo ""
echo "6. 代理测试:"
curl -s "http://localhost:3002/search?q=test&site=archive" | head -50

echo ""
echo "=== 检查完成 ==="
```

## 本地端配置更新

迁移后需要更新本地配置：

```bash
# 1. 更新环境变量
export VPS_PROXY_URL="http://新VPS-IP:3002"

# 2. 或者更新 SSH 隧道配置
# 编辑 /etc/systemd/system/wechat-proxy-tunnel.service
# 更新 RemoteForward 或 LocalForward

# 3. 重启本地服务
systemctl restart personal-assistant
```

## 自动化备份（可选）

创建定时备份任务：

```bash
# 添加到 crontab
0 2 * * 0 /opt/video-crawler-proxy/backup.sh
```

---

最后更新: 2026-04-04
