/**
 * IDE 文件管理路由
 * 提供文件浏览、读取、保存、创建、删除、搜索、上传等功能
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { authMiddleware } = require('../middleware/auth');
const multer = require('multer');
const { execSync } = require('child_process');

// 允许访问的根目录
const ROOT_DIRS = ['/opt/personalAssistant', '/opt/projects'];

/**
 * 验证路径安全性，防止路径遍历攻击
 */
function validatePath(filePath) {
  const resolved = path.resolve(filePath);
  const allowed = ROOT_DIRS.some(dir => resolved.startsWith(dir + path.sep) || resolved === dir);
  if (!allowed) {
    throw new Error('访问被拒绝：路径超出允许范围');
  }
  return resolved;
}

/**
 * 获取文件图标名（根据扩展名）
 */
function getFileIcon(name) {
  const ext = path.extname(name).toLowerCase();
  const iconMap = {
    '.js': '📜', '.ts': '📘', '.vue': '💚', '.jsx': '⚛️', '.tsx': '⚛️',
    '.json': '📋', '.css': '🎨', '.scss': '🎨', '.less': '🎨',
    '.html': '🌐', '.md': '📝', '.py': '🐍', '.sh': '🐚',
    '.sql': '🗃️', '.yml': '⚙️', '.yaml': '⚙️', '.xml': '📰',
    '.log': '📃', '.env': '🔒', '.gitignore': '🚫', '.dockerignore': '🐳',
    '.conf': '⚙️', '.config': '⚙️',
  };
  return iconMap[ext] || '📄';
}

// 所有路由都需要登录认证
router.use(authMiddleware);

// multer 配置 - 内存存储
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
});

/**
 * POST /api/ide/upload-folder
 * 上传整个文件夹（拖拽文件夹到 IDE）
 */
router.post('/upload-folder', upload.array('files', 500), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '没有上传文件' });
    }

    const folderName = (req.body.folderName || 'untitled').replace(/[^a-zA-Z0-9_\-.]/g, '_');
    const projectsDir = '/opt/projects';
    if (!fs.existsSync(projectsDir)) {
      fs.mkdirSync(projectsDir, { recursive: true });
    }
    const projectPath = path.join(projectsDir, folderName);

    if (fs.existsSync(projectPath)) {
      // 合并到已有项目
    } else {
      fs.mkdirSync(projectPath, { recursive: true });
    }

    for (const file of req.files) {
      const relativePath = file.originalname;
      const fullPath = path.join(projectPath, relativePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, file.buffer);
    }

    res.json({ success: true, project: folderName });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/ide/upload
 * 上传项目文件（支持 zip 压缩包）
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' });
    }

    const projectsDir = '/opt/projects';
    if (!fs.existsSync(projectsDir)) {
      fs.mkdirSync(projectsDir, { recursive: true });
    }

    const originalName = req.file.originalname;
    const isZip = originalName.endsWith('.zip');

    let projectName;
    if (isZip) {
      projectName = path.basename(originalName, '.zip');
    } else {
      projectName = originalName;
    }

    // 清理项目名
    projectName = projectName.replace(/[^a-zA-Z0-9_\-.]/g, '_');
    const projectPath = path.join(projectsDir, projectName);

    if (fs.existsSync(projectPath)) {
      return res.status(409).json({ error: `项目 "${projectName}" 已存在` });
    }

    if (isZip) {
      // 保存 zip 到临时文件
      const tmpZip = path.join('/tmp', `upload_${Date.now()}.zip`);
      fs.writeFileSync(tmpZip, req.file.buffer);

      // 创建目标目录
      fs.mkdirSync(projectPath, { recursive: true });

      // 解压，过滤 node_modules 等无用目录
      try {
        execSync(`unzip -o "${tmpZip}" -d "${projectPath}" --exclude "*/node_modules/*" "*/.git/*" "*/dist/*" "*/.next/*" "*/__pycache__/*" "*/.DS_Store" 2>&1`, {
          timeout: 60000,
          maxBuffer: 10 * 1024 * 1024,
        });
      } finally {
        fs.unlinkSync(tmpZip);
      }

      // 如果解压后只有一个顶层目录，提升其内容
      const entries = fs.readdirSync(projectPath);
      if (entries.length === 1) {
        const singleDir = path.join(projectPath, entries[0]);
        const stat = fs.statSync(singleDir);
        if (stat.isDirectory() && !entries[0].startsWith('.')) {
          const tmpLift = path.join('/tmp', `lift_${Date.now()}`);
          fs.renameSync(singleDir, tmpLift);
          // 清空 projectPath，移入内容
          fs.rmSync(projectPath, { recursive: true });
          fs.mkdirSync(projectPath, { recursive: true });
          const lifted = fs.readdirSync(tmpLift);
          for (const item of lifted) {
            fs.renameSync(path.join(tmpLift, item), path.join(projectPath, item));
          }
          fs.rmdirSync(tmpLift);
        }
      }
    } else {
      fs.mkdirSync(projectPath, { recursive: true });
      fs.writeFileSync(path.join(projectPath, originalName), req.file.buffer);
    }

    // 清理解压后的 node_modules 等目录
    function cleanUnwanted(dir) {
      try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const fp = path.join(dir, item);
          if (item === 'node_modules' || item === '.git' || item === '__pycache__') {
            fs.rmSync(fp, { recursive: true, force: true });
          } else {
            try {
              if (fs.statSync(fp).isDirectory()) cleanUnwanted(fp);
            } catch (e) {}
          }
        }
      } catch (e) {}
    }
    cleanUnwanted(projectPath);

    res.json({ success: true, project: projectName, path: projectPath });
  } catch (err) {
    console.error('上传失败:', err);
    res.status(500).json({ error: '上传失败: ' + err.message });
  }
});

/**
 * GET /api/ide/tree?path=
 * 列出目录内容
 */
router.get('/tree', (req, res) => {
  try {
    const targetPath = validatePath(req.query.path || ROOT_DIRS[0]);
    
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: '目录不存在' });
    }

    const stat = fs.statSync(targetPath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: '不是目录' });
    }

    const items = fs.readdirSync(targetPath, { withFileTypes: true })
      .map(dirent => {
        const fullPath = path.join(targetPath, dirent.name);
        try {
          const itemStat = fs.statSync(fullPath);
          return {
            name: dirent.name,
            path: fullPath,
            type: dirent.isDirectory() ? 'dir' : 'file',
            size: dirent.isFile() ? itemStat.size : 0,
            modified: itemStat.mtimeMs,
            icon: dirent.isDirectory() ? '📁' : getFileIcon(dirent.name),
          };
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    // 过滤 node_modules 和 .git 等大型目录（仅在第一级过滤）
    const filtered = items.filter(item => {
      if (item.type === 'dir' && (item.name === 'node_modules' || item.name === '.git' || item.name === 'dist' || item.name === '.next' || item.name === '__pycache__')) {
        return false;
      }
      return true;
    });

    res.json(filtered);
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

/**
 * GET /api/ide/file?path=
 * 读取文件内容
 */
router.get('/file', (req, res) => {
  try {
    const targetPath = validatePath(req.query.path);
    
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: '文件不存在' });
    }

    const stat = fs.statSync(targetPath);
    if (!stat.isFile()) {
      return res.status(400).json({ error: '不是文件' });
    }

    if (stat.size > 5 * 1024 * 1024) {
      return res.status(413).json({ error: '文件太大，超过 5MB 限制' });
    }

    const content = fs.readFileSync(targetPath, 'utf-8');
    res.json({ content, size: stat.size, modified: stat.mtimeMs });
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

/**
 * PUT /api/ide/file
 * 保存文件内容，自动创建备份
 */
router.put('/file', (req, res) => {
  try {
    const { path: filePath, content } = req.body;
    if (!filePath || content === undefined) {
      return res.status(400).json({ error: '缺少参数' });
    }

    const targetPath = validatePath(filePath);
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(targetPath)) {
      try { fs.copyFileSync(targetPath, targetPath + '.bak'); } catch (e) {}
    }

    fs.writeFileSync(targetPath, content, 'utf-8');
    res.json({ success: true, message: '保存成功' });
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

/**
 * POST /api/ide/file
 * 创建新文件或文件夹
 */
router.post('/file', (req, res) => {
  try {
    const { path: filePath, type } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: '缺少路径参数' });
    }

    const targetPath = validatePath(filePath);

    if (fs.existsSync(targetPath)) {
      return res.status(409).json({ error: '文件或目录已存在' });
    }

    if (type === 'dir') {
      fs.mkdirSync(targetPath, { recursive: true });
    } else {
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(targetPath, '', 'utf-8');
    }

    res.json({ success: true, message: '创建成功' });
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

/**
 * DELETE /api/ide/file?path=
 * 删除文件或空目录
 */
router.delete('/file', (req, res) => {
  try {
    const targetPath = validatePath(req.query.path);
    
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: '文件不存在' });
    }

    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      const contents = fs.readdirSync(targetPath);
      if (contents.length > 0) {
        return res.status(400).json({ error: '目录不为空，无法删除' });
      }
      fs.rmdirSync(targetPath);
    } else {
      fs.unlinkSync(targetPath);
    }

    res.json({ success: true, message: '删除成功' });
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

/**
 * POST /api/ide/miniprogram/create
 * 创建微信小程序项目模板
 */
router.post('/miniprogram/create', (req, res) => {
  try {
    const { name, appid, description, targetDir } = req.body;
    if (!name || !targetDir) {
      return res.status(400).json({ error: '缺少项目名称或目标路径' });
    }

    const projectPath = path.join(targetDir, name.replace(/[^a-zA-Z0-9_\-.]/g, '_'));
    if (fs.existsSync(projectPath)) {
      return res.status(409).json({ error: '项目已存在' });
    }

    // 创建小程序标准结构
    const dirs = ['pages/index', 'pages/logs', 'utils', 'images'];
    for (const d of dirs) {
      fs.mkdirSync(path.join(projectPath, d), { recursive: true });
    }

    // app.json
    fs.writeFileSync(path.join(projectPath, 'app.json'), JSON.stringify({
      pages: ['pages/index/index', 'pages/logs/logs'],
      window: {
        backgroundTextStyle: 'dark',
        navigationBarBackgroundColor: '#fff',
        navigationBarTitleText: name,
        navigationBarTextStyle: 'black',
        style: 'v2',
        sitemapLocation: 'sitemap.json',
      },
    }, null, 2));

    // app.js
    fs.writeFileSync(path.join(projectPath, 'app.js'), `App({
  onLaunch() {
    console.log('App launched');
  },
  globalData: {
    userInfo: null,
  },
})`);

    // app.wxss
    fs.writeFileSync(path.join(projectPath, 'app.wxss'), `/**app.wxss**/
page {
  height: 100%;
  font-size: 28rpx;
  line-height: 1.5;
  color: #333;
  background-color: #f5f5f5;
}`);

    // project.config.json
    fs.writeFileSync(path.join(projectPath, 'project.config.json'), JSON.stringify({
      description: description || '',
      packOptions: { ignore: [], ignoreUploadIgnoreRules: true },
      setting: {
        bundle: false,
        userConfirmedBundleSwitch: false,
        urlCheck: true,
        scopeDataCheck: false,
        coverView: true,
        es6: true,
        postcss: true,
        compileHotReLoad: false,
        lazyloadPlaceholderEnable: false,
        preloadBackgroundData: false,
        minify: true,
        autoAudits: false,
        newFeature: false,
        uglifyFileName: false,
        uploadWithSourceMap: true,
        useIsolateContext: true,
        nodeModules: false,
        enhance: true,
        useMultiFrameRuntime: true,
        useApiHook: true,
        useApiHostProcess: true,
        showShadowRootInWxmlPanel: true,
        packNpmManually: false,
        enableEngineNative: false,
        packNpmRelationList: [],
        minifyWXSS: true,
        showES6CompileOption: false,
        minifyWXML: true,
        babelSetting: { ignore: [], disablePlugins: [], outputPath: '' },
      },
      condition: {},
      appid: appid || '',
      libVersion: '3.15.2',
      projectname: name.replace(/[^a-zA-Z0-9_\-.]/g, '_'),
      simulatorType: 'wechat',
      simulatorPluginLibVersion: {},
      srcMinPlatform: 3,
    }, null, 2));

    // sitemap.json
    fs.writeFileSync(path.join(projectPath, 'sitemap.json'), JSON.stringify({
      desc: '关于本文件的更多信息，请参考文档',
      rules: [{ action: 'allow', page: '*' }],
    }, null, 2));

    // pages/index/index
    fs.writeFileSync(path.join(projectPath, 'pages/index/index.js'), `Page({
  data: {
    motto: 'Hello World',
  },
  onLoad() {
    console.log('Index page loaded');
  },
})`);

    fs.writeFileSync(path.join(projectPath, 'pages/index/index.json'), JSON.stringify({
      usingComponents: {},
      navigationBarTitleText: '首页',
    }, null, 2));

    fs.writeFileSync(path.join(projectPath, 'pages/index/index.wxml'), `<view class="container">
  <view class="userinfo">
    <button wx:if="{{!hasUserInfo && canIUse}}" type="primary" bindtap="getUserProfile" block>
      获取头像昵称
    </button>
    <block wx:else>
      <image wx:if="{{userInfo}}" class="userinfo-avatar" src="{{userInfo.avatarUrl}}" background-size="cover"></image>
      <text class="userinfo-nickname">{{userInfo.nickName}}</text>
    </block>
  </view>
  <view class="usermotto">
    <text class="user-motto">{{motto}}</text>
  </view>
</view>`);

    fs.writeFileSync(path.join(projectPath, 'pages/index/index.wxss'), `.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
  min-height: 100vh;
}
.userinfo {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 40rpx 0;
}
.userinfo-avatar {
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  margin-bottom: 20rpx;
}
.userinfo-nickname {
  font-size: 32rpx;
  font-weight: bold;
}
.usermotto {
  margin-top: 60rpx;
}
.user-motto {
  font-size: 36rpx;
  color: #666;
}`);

    // pages/logs/logs
    fs.writeFileSync(path.join(projectPath, 'pages/logs/logs.js'), `const app = getApp();
Page({
  data: { logs: [] },
  onLoad() {
    this.setData({
      logs: (wx.getStorageSync('logs') || []).map(log => new Date(log).toLocaleString()),
    });
  },
})`);

    fs.writeFileSync(path.join(projectPath, 'pages/logs/logs.json'), JSON.stringify({
      usingComponents: {},
      navigationBarTitleText: '查看启动日志',
    }, null, 2));

    fs.writeFileSync(path.join(projectPath, 'pages/logs/logs.wxml'), `<view class="container log-container">
  <view class="log-item" wx:for="{{logs}}" wx:key="*this">
    <text>{{item}}</text>
  </view>
</view>`);

    fs.writeFileSync(path.join(projectPath, 'pages/logs/logs.wxss'), `.log-container {
  padding: 20rpx;
}
.log-item {
  padding: 10rpx 0;
  border-bottom: 1rpx solid #eee;
  font-size: 24rpx;
  color: #666;
  font-family: monospace;
}`);

    // utils/util.js
    fs.writeFileSync(path.join(projectPath, 'utils/util.js'), `const formatTime = date => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const minute = date.getMinutes();
  const second = date.getSeconds();
  return \`\${[year, month, day].map(n => String(n).padStart(2, '0')).join('/')} \${[hour, minute, second].map(n => String(n).padStart(2, '0')).join(':')}\`;
};

module.exports = { formatTime };`);

    res.json({ success: true, path: projectPath });
  } catch (e) {
    console.error('创建小程序项目失败:', e);
    res.status(500).json({ error: '创建失败: ' + e.message });
  }
});

/**
 * POST /api/ide/miniprogram/upload
 * 上传小程序到微信体验版（使用 miniprogram-ci）
 */
router.post('/miniprogram/upload', async (req, res) => {
  try {
    const { projectPath, appid, version, desc, qrCodeOutput } = req.body;
    if (!projectPath || !appid) {
      return res.status(400).json({ error: '缺少项目路径或 AppID' });
    }

    // 检查 miniprogram-ci 是否安装
    try {
      execSync('which miniprogram-ci', { stdio: 'ignore' });
    } catch {
      return res.status(400).json({ error: 'miniprogram-ci 未安装。请先运行: npm install -g miniprogram-ci' });
    }

    const ver = version || '1.0.0';
    const descText = desc || `自动上传 ${new Date().toLocaleString('zh-CN')}`;
    const qrOut = qrCodeOutput || `/tmp/mp_qr_${Date.now()}.png`;

    // 构造命令
    const cmd = `miniprogram-ci upload \
      --project-path "${projectPath}" \
      --appid "${appid}" \
      --private-key-path "/opt/personalAssistant/config/mp_private_key.${appid.slice(-4)}.key" \
      --desc "${descText}" \
      --setting es6="true" \
      --setting es7="true" \
      --setting minify="true" \
      --setting minifyWXML="true" \
      --setting minifyWXSS="true" \
      --setting autoPrefix="true" \
      --setting uploadWithSourceMap="true" \
      --qrcode-output "${qrOut}" \
      2>&1`;

    const output = execSync(cmd, { timeout: 120000, maxBuffer: 10 * 1024 * 1024 });

    res.json({
      success: true,
      output: output.toString(),
      qrCodePath: fs.existsSync(qrOut) ? qrOut : null,
      version: ver,
    });
  } catch (e) {
    console.error('小程序上传失败:', e);
    res.status(500).json({
      error: '上传失败: ' + e.message,
      output: e.stdout?.toString() || '',
    });
  }
});

/**
 * GET /api/ide/search?keyword=&path=
 * 搜索文件内容（简单 grep 实现）
 */
router.get('/search', (req, res) => {
  try {
    const { keyword, path: searchPath } = req.query;
    if (!keyword) {
      return res.status(400).json({ error: '缺少搜索关键词' });
    }

    const targetPath = validatePath(searchPath || ROOT_DIRS[0]);
    const results = [];
    const maxResults = 100;
    const maxFileSize = 1 * 1024 * 1024;

    function searchDir(dir) {
      if (results.length >= maxResults) return;
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }

      for (const entry of entries) {
        if (results.length >= maxResults) break;
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === '.next' || entry.name === '__pycache__') continue;

        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          searchDir(fullPath);
        } else if (entry.isFile()) {
          try {
            const stat = fs.statSync(fullPath);
            if (stat.size > maxFileSize || stat.size === 0) continue;
            const ext = path.extname(entry.name).toLowerCase();
            const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot'];
            if (binaryExts.includes(ext)) continue;

            const content = fs.readFileSync(fullPath, 'utf-8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].includes(keyword)) {
                results.push({ file: fullPath, line: i + 1, text: lines[i].trim().substring(0, 200) });
                if (results.length >= maxResults) break;
              }
            }
          } catch (e) {}
        }
      }
    }

    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      searchDir(targetPath);
    } else {
      const content = fs.readFileSync(targetPath, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(keyword)) {
          results.push({ file: targetPath, line: i + 1, text: lines[i].trim().substring(0, 200) });
        }
      }
    }

    res.json({ results, total: results.length });
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

/**
 * GET /api/ide/preview/:project/*
 * 实时预览 - 提供项目文件的静态访问
 */
router.get('/preview/:project/*', (req, res) => {
  try {
    const project = req.params.project;
    const filePath = req.params[0] || 'index.html';
    const basePath = project.startsWith('/') ? project : path.join('/opt/projects', project);
    const fullPath = path.join(basePath, filePath);
    const resolved = path.resolve(fullPath);

    // 安全检查：确保路径在项目目录内
    if (!resolved.startsWith(basePath)) {
      return res.status(403).json({ error: '访问被拒绝' });
    }

    if (!fs.existsSync(resolved)) {
      return res.status(404).json({ error: '文件不存在' });
    }

    const stat = fs.statSync(resolved);
    if (!stat.isFile()) {
      return res.status(400).json({ error: '不是文件' });
    }

    // 根据扩展名设置 Content-Type
    const ext = path.extname(resolved).toLowerCase();
    const mimeMap = {
      '.html': 'text/html; charset=utf-8',
      '.htm': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.xml': 'application/xml',
      '.wxml': 'text/html; charset=utf-8',
      '.wxss': 'text/css; charset=utf-8',
    };

    const contentType = mimeMap[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // 对于 wxml 文件，做简单转换后返回
    if (ext === '.wxml') {
      const content = fs.readFileSync(resolved, 'utf-8');
      const htmlContent = convertWxmlToHtml(content);
      res.send(htmlContent);
      return;
    }

    res.sendFile(resolved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 简单的 WXML 转 HTML（支持基础标签和指令）
 */
function convertWxmlToHtml(wxml) {
  let html = wxml;

  // 移除 wx:if / wx:else / wx:elif
  html = html.replace(/wx:if\s*=\s*"\{\{[^}]*\}\}"/g, '');
  html = html.replace(/wx:else/g, '');
  html = html.replace(/wx:elif\s*=\s*"\{\{[^}]*\}\}"/g, '');

  // 移除 wx:for / wx:for-item / wx:key
  html = html.replace(/wx:for\s*=\s*"\{\{[^}]*\}\}"/g, '');
  html = html.replace(/wx:for-item\s*=\s*"[^"]*"/g, '');
  html = html.replace(/wx:key\s*=\s*"[^"]*"/g, '');

  // 移除 wx:model
  html = html.replace(/wx:model\s*=\s*"\{\{[^}]*\}\}"/g, '');

  // 替换 bindtap 为 onclick（简单演示）
  html = html.replace(/bindtap\s*=\s*"[^"]*"/g, '');

  // 替换 {{}} 表达式为占位符
  html = html.replace(/\{\{[^}]*\}\}/g, function(match) {
    return `<span style="color:#999;font-size:10px;" title="${match}">?</span>`;
  });

  // 替换小程序特有组件为 HTML 等价物
  html = html.replace(/<view/g, '<div');
  html = html.replace(/<\/view>/g, '</div>');
  html = html.replace(/<text/g, '<span');
  html = html.replace(/<\/text>/g, '</span>');
  html = html.replace(/<image/g, '<img');
  html = html.replace(/<button/g, '<button');
  html = html.replace(/<input/g, '<input');
  html = html.replace(/<textarea/g, '<textarea');
  html = html.replace(/<scroll-view/g, '<div style="overflow:auto;"');
  html = html.replace(/<swiper/g, '<div class="swiper-preview"');
  html = html.replace(/<picker/g, '<select');

  // 添加基础样式重置
  const style = `<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, sans-serif; font-size: 14px; line-height: 1.5; color: #333; }
    .swiper-preview { position: relative; overflow: hidden; }
    image { max-width: 100%; height: auto; }
  </style>`;

  if (html.includes('</head>')) {
    html = html.replace('</head>', style + '</head>');
  } else {
    html = style + html;
  }

  return html;
}

/**
 * GET /api/ide/preview-url
 * 获取当前项目的预览 URL
 */
router.get('/preview-url', (req, res) => {
  try {
    const projectPath = req.query.path;
    if (!projectPath) {
      return res.status(400).json({ error: '缺少路径参数' });
    }

    const projectName = path.basename(projectPath);
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const previewUrl = `${baseUrl}/api/ide/preview/${encodeURIComponent(projectName)}/`;

    res.json({
      success: true,
      previewUrl,
      projectName,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
