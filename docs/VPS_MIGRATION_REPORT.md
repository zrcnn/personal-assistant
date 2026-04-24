# VPS 迁移备份报告

## 备份日期
2026-04-04

## 当前服务器信息
- **IP**: 101.43.120.108
- **服务**: video-crawler-proxy
- **端口**: 3002
- **状态**: ✅ 正常运行

## 备份内容

### 1. 服务代码备份
位置: `/opt/backups/video-crawler-proxy/20260404/`

包含文件:
- `server.js` - 视频爬虫代理服务代码 (105 行)
- `video-crawler-proxy.service` - systemd 服务配置 (13 行)
- `firewall-rules.txt` - 防火墙规则 (11 行)
- `MANIFEST.md` - 备份清单 (21 行)

### 2. 一键部署脚本
位置: `/opt/backups/video-crawler-proxy/deploy.sh`

功能:
- 自动创建服务目录
- 部署服务代码
- 配置 systemd 服务
- 配置防火墙
- 自动启动服务
- 验证部署成功

使用:
```bash
bash deploy.sh 3002  # 部署到端口 3002
```

### 3. 检查脚本
位置: `/opt/backups/video-crawler-proxy/check.sh`

功能:
- 检查 Node.js 安装
- 检查服务状态
- 检查端口监听
- 检查防火墙规则
- 测试服务响应
- 测试代理功能

使用:
```bash
bash check.sh
```

## 迁移步骤

### 新服务器部署

1. **上传备份文件到新服务器**
   ```bash
   scp -r /opt/backups/video-crawler-proxy/ root@新IP:/opt/
   ```

2. **运行部署脚本**
   ```bash
   cd /opt/video-crawler-proxy
   bash deploy.sh 3002
   ```

3. **验证部署**
   ```bash
   bash check.sh
   ```

### 本地配置更新

1. **更新 SSH 隧道**
   ```bash
   # 停止旧隧道
   pkill -f "13002.*3002"
   
   # 创建新隧道
   nohup ssh -N -o StrictHostKeyChecking=no \
     -o ServerAliveInterval=60 \
     -o ServerAliveCountMax=3 \
     -i /root/.ssh/wechat_proxy \
     -L 13002:127.0.0.1:3002 \
     root@新IP &
   ```

2. **更新环境变量**
   ```bash
   # 编辑 /opt/personalAssistant/backend/.env
   VPS_PROXY_URL=http://127.0.0.1:13002
   ```

3. **重启本地服务**
   ```bash
   systemctl restart personal-assistant
   ```

## 验证清单

- [ ] VPS 服务正常运行
- [ ] SSH 隧道正常建立
- [ ] 本地服务能访问 VPS 代理
- [ ] 视频搜索功能正常
- [ ] 播放地址解析正常

## 注意事项

1. **SSH 密钥**: 确保新服务器可以使用相同的 SSH 密钥访问
2. **防火墙**: 确保新服务器开放了 3002 端口
3. **Node.js**: 确保新服务器安装了 Node.js
4. **域名/IP**: 如果有域名绑定，记得更新 DNS

## 回滚方案

如果新服务器出现问题，可以:

1. 恢复旧服务器（如果还在运行）
2. 更新本地配置指向旧服务器
3. 重启本地服务

## 联系信息

如有问题，查看:
- 服务日志: `journalctl -u video-crawler-proxy -n 50`
- 本地日志: `journalctl -u personal-assistant -n 50`

---

备份完成时间: 2026-04-04 14:49 CST
