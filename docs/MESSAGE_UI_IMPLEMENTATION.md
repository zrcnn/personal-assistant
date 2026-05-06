# 消息界面完善实施报告

## ✅ 已完成

### 1. 数据库扩展 (backend/config/db.js)
- [x] `user_notes` 表 - 用户备注、拉黑功能
- [x] `message_attachments` 表 - 私聊图片附件（7天自动清理）
- [x] `group_message_attachments` 表 - 群聊图片附件（7天自动清理）
- [x] `user_messages` 扩展 - `message_type`, `attachment_id` 字段
- [x] `group_messages` 扩展 - `message_type`, `attachment_id` 字段

### 2. 后端 API (backend/routes/messages.js)
- [x] 图片上传支持 (multer, `/api/messages/conversations/:id/messages` POST)
- [x] 消息分页、关键词搜索、日期范围过滤 (GET with params)
- [x] 用户备注 API (`GET/PUT /api/messages/users/:userId/note`)
- [x] 用户信息 API (`GET /api/messages/users/:userId/info`)
- [x] 全局消息搜索 (`GET /api/messages/conversations/search`)
- [x] 7天附件清理 API (`DELETE /api/messages/attachments/cleanup`)

### 3. 后端 API (backend/routes/groupChat.js)
- [x] 群聊图片上传支持
- [x] 群聊消息分页
- [x] 群聊附件清理 API

### 4. 前端 API 模块 (frontend/src/api/modules.js)
- [x] `userMessagesAPI.sendMessage()` 支持图片上传
- [x] `userMessagesAPI.getMessages()` 支持分页和搜索参数
- [x] `userMessagesAPI.getUserNote()` / `setUserNote()` / `getUserInfo()`
- [x] `userMessagesAPI.searchMessages()` 全局搜索
- [x] `groupChatAPI.sendMessage()` 支持图片上传
- [x] `groupChatAPI.getMessages()` 支持分页

## 🚧 待完成（前端 UI）

### MessagesView.vue 需要添加的功能：

1. **图片消息显示**
   - 消息气泡内显示图片缩略图
   - 点击图片放大查看（lightbox）
   - 图片过期提示（>7天）

2. **图片发送按钮**
   - 输入框旁的 📎 按钮
   - 点击弹出文件选择 / 拖拽上传
   - 上传进度指示

3. **用户信息侧边栏**
   - 点击聊天头部头像弹出
   - 显示用户信息（用户名、注册时间）
   - 备注名编辑
   - 备注描述
   - 拉黑/取消拉黑开关

4. **消息搜索面板**
   - 搜索图标按钮
   - 关键词输入
   - 日期范围选择器
   - 搜索结果列表（高亮关键词）
   - 点击结果跳转到对应消息

5. **移动端适配**
   - 上述功能在移动端的响应式布局

## 📋 部署步骤

1. **重启后端服务**
   ```bash
   cd /opt/personalAssistant
   systemctl restart pa-backend
   # 或
   pm2 restart pa-backend
   ```

2. **重新构建前端**
   ```bash
   cd /opt/personalAssistant/frontend
   npm run build
   ```

3. **数据库表会自动创建**（在 `db.js` 的 `ensureTables()` 中）

4. **设置定时清理任务**（可选，手动触发清理）
   ```bash
   curl -H "Authorization: Bearer <admin_token>" http://localhost:8090/api/messages/attachments/cleanup -X DELETE
   curl -H "Authorization: Bearer <admin_token>" http://localhost:8090/api/group-chats/attachments/cleanup -X DELETE
   ```

## 🎨 前端实施建议

由于 MessagesView.vue 已有 ~1000 行代码，建议：

1. 将用户信息侧边栏拆分为独立组件 `UserInfoPanel.vue`
2. 将图片查看器拆分为 `ImageLightbox.vue`
3. 将搜索面板拆分为 `MessageSearchPanel.vue`
4. 在 MessagesView.vue 中引入这些组件

这样可以保持代码可维护性，也便于复用。
