# Subagent Bot 部署说明

## 概述

Subagent Bot 是一个基于子代理的群聊机器人，完全替代原有的 NE Bot。它使用备用模型（ep-agr16j），支持聊天、执行命令、使用工具等完整功能。

## 架构变更

### 原有架构
- `neBotService.js`：简单的聊天机器人，只能进行文本对话
- 使用 `spawnChatAgent` 调用 openclaw agent
- 功能有限，无法执行命令或使用工具

### 新架构
- `subagentBotService.js`：基于子代理的完整机器人
- 使用 `openclaw agent` 派生独立子代理
- 子代理可以访问所有技能和工具
- 支持聊天、执行命令、文件操作、网络搜索等

## 文件变更

### 新增文件
- `/opt/personalAssistant/backend/services/subagentBotService.js` - 子代理机器人服务

### 修改文件
- `/opt/personalAssistant/backend/routes/groupChat.js` - 将 NE bot 替换为子代理机器人

## 配置说明

### 模型配置
```javascript
const config = {
  model: 'ep-agr16j-1776132426466498538',  // 备用模型
  maxConcurrent: 2,        // 最大并发子代理数
  queueDelay: 3000,        // 队列等待延迟
  taskTimeout: 60000,      // 子代理任务超时（60秒）
};
```

### 触发条件
机器人会在以下情况下响应：
- 提及 NE、机器人、bot、助手、AI
- 包含请求帮助的词语（帮我、请问、怎么、如何等）
- 包含疑问词（吗、嘛、？）
- 包含命令词（执行、运行、启动、停止、查看、创建等）

### 子代理能力
子代理可以使用以下工具：
- **terminal**：执行系统命令
- **file**：读取、写入、搜索文件
- **search**：网络搜索
- **web**：网页访问

子代理可以加载以下技能：
- `hermes-agent`：Hermes Agent 使用指南
- `codebase-inspection`：代码库检查
- `systematic-debugging`：系统化调试

## 使用方法

### 1. 确保 NE bot 用户在群聊中
群聊中需要包含用户ID为 999999 的 NE bot 用户，机器人才能被激活。

### 2. 发送触发消息
在群聊中发送包含触发词的消息，例如：
- "@NE 帮我查看系统状态"
- "机器人，怎么部署这个项目？"
- "帮我搜索最新的AI新闻"
- "执行 ls -la 命令"

### 3. 等待响应
机器人会派生子代理处理消息，通常在10-30秒内返回结果。

## 性能考虑

### 并发控制
- 最大并发子代理数：2
- 队列等待延迟：3秒
- 任务超时：60秒

### 资源消耗
- 每个子代理会消耗一定的 API token
- 建议设置合理的触发条件，避免过多响应
- 可以考虑添加速率限制，防止滥用

## 故障排除

### 机器人不响应
1. 检查群聊中是否有 NE bot 用户（ID=999999）
2. 检查消息是否包含触发词
3. 查看后端日志：`journalctl -u pa-backend -f`

### 响应超时
1. 检查子代理任务是否超时（默认60秒）
2. 检查模型是否可用
3. 查看 `/tmp/subagent-bot/` 目录下的临时文件

### 子代理执行失败
1. 检查 openclaw 是否正确安装
2. 检查 API key 是否有效
3. 查看子代理输出日志

## 扩展功能

### 添加新技能
在 `subagentBotService.js` 的 `buildTaskPrompt` 方法中，可以修改 `skills` 数组来添加更多技能：

```javascript
skills: ['hermes-agent', 'codebase-inspection', 'systematic-debugging', 'your-new-skill']
```

### 添加新工具
在 `buildTaskPrompt` 方法中修改 `tools` 数组：

```javascript
tools: ['terminal', 'file', 'search', 'web', 'your-new-tool']
```

### 自定义触发条件
修改 `shouldRespond` 方法来调整触发条件。

## 回滚方案

如果需要回滚到原有的 NE bot：

1. 恢复 `groupChat.js` 中的引用：
```javascript
const neBotService = require('../services/neBotService');
```

2. 恢复消息处理调用：
```javascript
neBotService.handleGroupMessage(id, req.user.id, req.user.username, content.trim())
```

3. 重启后端服务：
```bash
systemctl restart pa-backend
```

## 维护建议

1. **监控子代理状态**：定期检查 `/tmp/subagent-bot/` 目录，确保临时文件被正确清理
2. **日志轮转**：确保后端日志不会占满磁盘
3. **API 配额**：监控 API 使用情况，避免超额
4. **性能优化**：根据实际使用情况调整并发数和超时时间
