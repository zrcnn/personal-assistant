# PA - Personal Assistant

一个全栈智能助手平台，集成 AI 对话、任务管理、工具箱和实时数据处理能力。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Vue 3](https://img.shields.io/badge/Vue-3.x-green.svg)
![Node.js](https://img.shields.io/badge/Node.js-18+-brightgreen.svg)
![MySQL](https://img.shields.io/badge/MySQL-8+-orange.svg)

## ✨ 特性

### 🤖 AI 对话系统
- 流式响应引擎，支持 KAT-Coder、GPT-4、Claude 等模型
- 对话历史持久化，支持多会话管理
- 语音输入功能（Web Speech API）
- 上下文窗口智能管理

### 📋 智能任务管理
- 待办事项系统（待处理/进行中/已完成）
- 实时前后端同步
- 移动端适配

### 🧰 多功能工具箱
- **笔记模块** - Markdown 编辑器，代码高亮
- **支出记录** - 分类记账，数据统计
- **健身追踪** - 运动记录，进度可视化
- **文件管理** - IDE 风格文件浏览器
- **OCR 识别** - 图片文字提取
- **股票面板** - 实时股价监控
- **系统信息** - 服务器状态监控

### 💬 群聊机器人
- 企业微信/飞书平台集成
- 子代理架构，支持独立 AI 配置
- 完整工具调用能力

## 🚀 快速开始

### 环境要求

- Node.js 18+
- MySQL 8+
- npm 或 yarn

### 安装步骤

1. **克隆仓库**
```bash
git clone https://github.com/yourusername/personal-assistant.git
cd personal-assistant
```

2. **配置数据库**
```bash
# 创建 MySQL 数据库
mysql -u root -p
CREATE DATABASE personal_assistant CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

3. **后端配置**
```bash
cd backend
cp .env.example .env
# 编辑 .env 文件，配置数据库连接和 JWT 密钥
npm install
npm start
```

4. **前端配置**
```bash
cd frontend
npm install
npm run build
# 构建产物会自动被后端服务
```

5. **访问应用**
```
http://localhost:8090
```

## 📁 项目结构

```
personal-assistant/
├── backend/                 # Node.js 后端
│   ├── config/             # 数据库配置
│   ├── routes/             # API 路由
│   ├── middleware/         # 中间件
│   ├── services/           # 业务逻辑
│   └── server.js           # 主入口
├── frontend/               # Vue 3 前端
│   ├── src/
│   │   ├── views/         # 页面组件
│   │   ├── components/    # 通用组件
│   │   └── App.vue        # 根组件
│   └── public/            # 静态资源
├── docs/                   # 项目文档
├── scripts/                # 部署脚本
└── mysql-data/             # MySQL 数据目录（可选）
```

## 🔧 配置说明

### 环境变量

在 `backend/.env` 中配置：

```env
# 数据库
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=pa
DB_PASSWORD=your_password
DB_NAME=personal_assistant

# JWT 密钥（建议使用强随机字符串）
JWT_SECRET=your_jwt_secret_min_32_chars

# 服务端口
PORT=8090

# 管理员用户名
ADMIN_USERNAME=admin
```

### API 端点

- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `GET /api/conversations` - 获取对话列表
- `POST /api/conversations` - 创建新对话
- `GET /api/todos` - 获取待办事项
- `POST /api/todos` - 创建待办事项
- `GET /api/health` - 健康检查

## 🛠 技术栈

### 后端
- **Express.js** - Web 框架
- **MySQL 2** - 数据库驱动
- **JWT** - 身份认证
- **WebSocket** - 实时通信

### 前端
- **Vue 3** - 渐进式框架
- **Vue Router** - 路由管理
- **CSS Variables** - 主题系统
- **Web Speech API** - 语音识别

### 部署
- **systemd** - 服务管理
- **Nginx** - 反向代理
- **Certbot** - SSL 证书

## 📊 数据库设计

### 核心表
- `users` - 用户表
- `conversations` - AI 对话会话
- `messages` - 对话消息
- `user_settings` - 用户设置
- `todos` - 待办事项
- `fitness_records` - 健身记录
- `expenses` - 支出记录
- `notes` - 笔记

### 群聊相关
- `group_chats` - 群聊信息
- `group_members` - 群成员
- `group_messages` - 群消息

## 🚀 部署

### 生产环境部署

1. **使用 systemd 服务**
```bash
sudo cp scripts/pa-backend.service /etc/systemd/system/
sudo systemctl enable pa-backend
sudo systemctl start pa-backend
```

2. **配置 Nginx**
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

3. **配置 SSL（可选）**
```bash
sudo certbot --nginx -d your-domain.com
```

## 📝 API 文档

详细的 API 文档请参考 [API 文档](docs/API.md)

## 🧪 测试

```bash
# 后端测试
cd backend
npm test

# 前端测试
cd frontend
npm run test
```

## 📄 许可证

MIT License

## 🤝 贡献

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📧 联系方式

如有问题或建议，请提交 Issue 或联系维护者。

---

**注意**: 这是一个开源项目，仅供学习和个人使用。部署到生产环境时，请务必修改默认配置和密钥。
