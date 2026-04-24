const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const archiver = require('archiver');
const AdmZip = require('adm-zip');
const { pool } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ============ Configuration ============
const BASE_DIR = path.resolve('/root/.openclaw/workspace/');
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Ensure base dir exists
if (!fs.existsSync(BASE_DIR)) {
  fs.mkdirSync(BASE_DIR, { recursive: true });
}

// Multer config for uploads
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dest = req.body.destPath ? resolvePath(req.body.destPath) : BASE_DIR;
    if (!dest) return cb(new Error('无效路径'));
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    // Sanitize filename
    const safeName = file.originalname.replace(/[^\w\u4e00-\u9fa5.\-]/g, '_');
    cb(null, safeName);
  }
});
const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: MAX_FILE_SIZE, files: 20 },
});

// ============ Helpers ============

/**
 * Resolve a user path to absolute, blocking path traversal.
 * Returns null if the resolved path escapes BASE_DIR.
 */
function resolvePath(userPath) {
  if (!userPath || userPath === '') return BASE_DIR;
  // Remove leading slashes to make it relative to BASE_DIR
  const clean = userPath.replace(/^[/\\]+/, '');
  const resolved = path.resolve(BASE_DIR, clean);
  // Block path traversal
  if (!resolved.startsWith(BASE_DIR)) return null;
  return resolved;
}

/**
 * Get relative path from BASE_DIR
 */
function relativePath(absPath) {
  return path.relative(BASE_DIR, absPath);
}

/**
 * Format file size
 */
function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Log file operation to database
 */
async function logOperation(userId, action, targetPath, extra) {
  try {
    await pool.execute(
      `INSERT INTO file_operation_logs (user_id, action, target_path, extra_info) VALUES (?, ?, ?, ?)`,
      [userId, action, targetPath, extra ? JSON.stringify(extra).slice(0, 500) : null]
    );
  } catch (e) {
    console.error('[FileLog] Error:', e.message);
  }
}

/**
 * Get file stats with type
 */
function getEntryStats(fullPath, name) {
  const stats = fs.statSync(fullPath);
  const ext = path.extname(name).toLowerCase();
  let type = 'file';
  if (stats.isDirectory()) {
    type = 'folder';
  } else {
    // Detect type by extension
    const mediaTypes = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
    const docTypes = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md', '.csv'];
    const archiveTypes = ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'];
    const codeTypes = ['.js', '.ts', '.py', '.java', '.c', '.cpp', '.h', '.html', '.css', '.json', '.xml', '.vue', '.sql', '.sh', '.go', '.rs'];
    const audioTypes = ['.mp3', '.wav', '.ogg', '.flac', '.m4a'];
    const videoTypes = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.webm'];

    if (mediaTypes.includes(ext)) type = 'image';
    else if (docTypes.includes(ext)) type = 'document';
    else if (archiveTypes.includes(ext)) type = 'archive';
    else if (codeTypes.includes(ext)) type = 'code';
    else if (audioTypes.includes(ext)) type = 'audio';
    else if (videoTypes.includes(ext)) type = 'video';
  }

  return {
    name,
    type,
    size: stats.size,
    sizeFormatted: formatSize(stats.size),
    modifiedAt: stats.mtime.toISOString(),
    createdAt: stats.birthtime.toISOString(),
    isDirectory: stats.isDirectory(),
    isFile: stats.isFile()
  };
}

// ============ Ensure log table ============
pool.execute(`
  CREATE TABLE IF NOT EXISTS file_operation_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    action VARCHAR(50) NOT NULL,
    target_path VARCHAR(500) NOT NULL,
    extra_info TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_action (action),
    INDEX idx_created_at (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`).catch(e => console.error('[FileManager] Log table error:', e.message));

// ============ Routes ============

// GET /api/file/list - List files in directory
router.get('/list', authMiddleware, (req, res) => {
  try {
    const userPath = req.query.path || '';
    const fullPath = resolvePath(userPath);

    if (!fullPath) {
      return res.status(403).json({ error: '禁止访问该路径' });
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: '路径不存在' });
    }

    const stats = fs.statSync(fullPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: '不是目录' });
    }

    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    const folders = [];
    const files = [];

    for (const entry of entries) {
      // Skip hidden files
      if (entry.name.startsWith('.')) continue;
      try {
        const entryPath = path.join(fullPath, entry.name);
        const info = getEntryStats(entryPath, entry.name);
        if (entry.isDirectory()) {
          folders.push(info);
        } else {
          files.push(info);
        }
      } catch (e) {
        // Skip entries we can't stat
      }
    }

    // Sort: folders first (alpha), then files (alpha)
    folders.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
    files.sort((a, b) => a.name.localeCompare(b.name, 'zh'));

    const currentPath = relativePath(fullPath);

    logOperation(req.user.id, 'list', currentPath || '/').catch(() => {});

    res.json({
      path: currentPath || '/',
      parentPath: currentPath ? path.relative(BASE_DIR, path.dirname(fullPath)) || '/' : null,
      folders,
      files,
      total: folders.length + files.length
    });
  } catch (err) {
    console.error('[FileList] Error:', err);
    res.status(500).json({ error: '获取文件列表失败: ' + err.message });
  }
});

// POST /api/file/upload - Upload files
router.post('/upload', authMiddleware, upload.array('files', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '请选择要上传的文件' });
    }

    const destPath = req.body.destPath || '';
    const uploaded = req.files.map(f => ({
      name: f.originalname,
      size: f.size,
      path: relativePath(f.path)
    }));

    // Auto-extract ZIP files
    const extracted = [];
    for (const file of req.files) {
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext === '.zip') {
        try {
          const zip = new AdmZip(file.path);
          const extractDir = path.join(path.dirname(file.path), path.basename(file.originalname, '.zip'));
          fs.mkdirSync(extractDir, { recursive: true });
          zip.extractAllTo(extractDir, true);
          // Remove the zip after extraction
          fs.unlinkSync(file.path);
          extracted.push({
            name: path.basename(file.originalname, '.zip'),
            path: relativePath(extractDir)
          });
        } catch (e) {
          console.error('[Upload] ZIP extract error:', e.message);
        }
      }
    }

    const relDest = destPath || '/';
    await logOperation(req.user.id, 'upload', relDest, {
      files: uploaded.map(f => f.name),
      extracted: extracted.map(f => f.name)
    });

    res.json({
      success: true,
      uploaded,
      extracted,
      message: `成功上传 ${uploaded.length} 个文件` + (extracted.length ? `，自动解压 ${extracted.length} 个压缩包` : '')
    });
  } catch (err) {
    console.error('[Upload] Error:', err);
    res.status(500).json({ error: '上传失败: ' + err.message });
  }
});

// GET /api/file/download - Download a file
router.get('/download', authMiddleware, (req, res) => {
  try {
    const userPath = req.query.path;
    if (!userPath) {
      return res.status(400).json({ error: '请指定文件路径' });
    }

    const fullPath = resolvePath(userPath);
    if (!fullPath) {
      return res.status(403).json({ error: '禁止访问该路径' });
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: '文件不存在' });
    }

    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      return res.status(400).json({ error: '这是一个目录，请使用打包下载' });
    }

    logOperation(req.user.id, 'download', userPath).catch(() => {});

    res.download(fullPath, path.basename(fullPath));
  } catch (err) {
    console.error('[Download] Error:', err);
    res.status(500).json({ error: '下载失败: ' + err.message });
  }
});

// GET /api/file/zip - Download folder as ZIP
router.get('/zip', authMiddleware, (req, res) => {
  try {
    const userPath = req.query.path;
    if (!userPath) {
      return res.status(400).json({ error: '请指定路径' });
    }

    const fullPath = resolvePath(userPath);
    if (!fullPath) {
      return res.status(403).json({ error: '禁止访问该路径' });
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: '路径不存在' });
    }

    const stats = fs.statSync(fullPath);
    const isDir = stats.isDirectory();
    const archiveName = path.basename(fullPath) + '.zip';

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(archiveName)}"`);

    const archive = archiver('zip', { zlib: { level: 6 } });

    archive.on('error', (err) => {
      console.error('[ZIP] Error:', err);
      res.status(500).json({ error: '打包失败' });
    });

    archive.pipe(res);

    if (isDir) {
      archive.directory(fullPath, path.basename(fullPath));
    } else {
      archive.file(fullPath, { name: path.basename(fullPath) });
    }

    archive.finalize();

    logOperation(req.user.id, 'zip', userPath).catch(() => {});
  } catch (err) {
    console.error('[ZIP] Error:', err);
    res.status(500).json({ error: '打包失败: ' + err.message });
  }
});

// POST /api/file/mkdir - Create folder
router.post('/mkdir', authMiddleware, async (req, res) => {
  try {
    const { path: userPath, name } = req.body;
    if (!name) {
      return res.status(400).json({ error: '请指定文件夹名称' });
    }

    const parentPath = resolvePath(userPath || '');
    if (!parentPath) {
      return res.status(403).json({ error: '禁止访问该路径' });
    }

    const fullPath = path.join(parentPath, name.replace(/[/\\]/g, '_'));

    if (fs.existsSync(fullPath)) {
      return res.status(400).json({ error: '文件夹已存在' });
    }

    fs.mkdirSync(fullPath, { recursive: true });

    const relPath = relativePath(fullPath);
    await logOperation(req.user.id, 'mkdir', relPath);

    res.json({ success: true, path: relPath });
  } catch (err) {
    console.error('[Mkdir] Error:', err);
    res.status(500).json({ error: '创建文件夹失败: ' + err.message });
  }
});

// POST /api/file/rename - Rename file/folder
router.post('/rename', authMiddleware, async (req, res) => {
  try {
    const { path: userPath, newName } = req.body;
    if (!userPath || !newName) {
      return res.status(400).json({ error: '请指定路径和新名称' });
    }

    const fullPath = resolvePath(userPath);
    if (!fullPath) {
      return res.status(403).json({ error: '禁止访问该路径' });
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: '文件/文件夹不存在' });
    }

    const parentDir = path.dirname(fullPath);
    const safeName = newName.replace(/[/\\]/g, '_');
    const newPath = path.join(parentDir, safeName);

    // Ensure new path is still within BASE_DIR
    if (!newPath.startsWith(BASE_DIR)) {
      return res.status(403).json({ error: '重命名后路径超出允许范围' });
    }

    if (fs.existsSync(newPath)) {
      return res.status(400).json({ error: '目标名称已存在' });
    }

    fs.renameSync(fullPath, newPath);

    const relPath = relativePath(newPath);
    await logOperation(req.user.id, 'rename', userPath, { newName: relPath });

    res.json({ success: true, path: relPath });
  } catch (err) {
    console.error('[Rename] Error:', err);
    res.status(500).json({ error: '重命名失败: ' + err.message });
  }
});

// POST /api/file/delete - Delete file/folder
router.post('/delete', authMiddleware, async (req, res) => {
  try {
    const { path: userPath } = req.body;
    if (!userPath) {
      return res.status(400).json({ error: '请指定路径' });
    }

    const fullPath = resolvePath(userPath);
    if (!fullPath) {
      return res.status(403).json({ error: '禁止访问该路径' });
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: '文件/文件夹不存在' });
    }

    // Prevent deleting BASE_DIR itself
    if (fullPath === BASE_DIR) {
      return res.status(403).json({ error: '禁止删除根目录' });
    }

    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(fullPath);
    }

    await logOperation(req.user.id, 'delete', userPath);

    res.json({ success: true });
  } catch (err) {
    console.error('[Delete] Error:', err);
    res.status(500).json({ error: '删除失败: ' + err.message });
  }
});

// POST /api/file/unzip - Extract ZIP file
router.post('/unzip', authMiddleware, async (req, res) => {
  try {
    const { path: userPath, destPath } = req.body;
    if (!userPath) {
      return res.status(400).json({ error: '请指定ZIP文件路径' });
    }

    const fullPath = resolvePath(userPath);
    if (!fullPath) {
      return res.status(403).json({ error: '禁止访问该路径' });
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: '文件不存在' });
    }

    const ext = path.extname(fullPath).toLowerCase();
    if (ext !== '.zip') {
      return res.status(400).json({ error: '仅支持 ZIP 格式解压' });
    }

    // Determine extraction destination
    let extractDir;
    if (destPath) {
      extractDir = resolvePath(destPath);
      if (!extractDir) {
        return res.status(403).json({ error: '禁止访问目标路径' });
      }
    } else {
      extractDir = path.join(path.dirname(fullPath), path.basename(fullPath, '.zip'));
    }

    fs.mkdirSync(extractDir, { recursive: true });

    const zip = new AdmZip(fullPath);
    zip.extractAllTo(extractDir, true);

    // Get list of extracted items
    const entries = zip.getEntries().map(e => e.entryName);

    await logOperation(req.user.id, 'unzip', userPath, {
      destPath: relativePath(extractDir),
      entries: entries.length
    });

    res.json({
      success: true,
      destPath: relativePath(extractDir),
      entries: entries.length
    });
  } catch (err) {
    console.error('[Unzip] Error:', err);
    res.status(500).json({ error: '解压失败: ' + err.message });
  }
});

// GET /api/file/search - Search files by name
router.get('/search', authMiddleware, (req, res) => {
  try {
    const { q, path: userPath } = req.query;
    if (!q) {
      return res.status(400).json({ error: '请输入搜索关键词' });
    }

    const searchDir = resolvePath(userPath || '');
    if (!searchDir) {
      return res.status(403).json({ error: '禁止访问该路径' });
    }

    const results = [];
    const query = q.toLowerCase();

    function walkDir(dir) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;
          const entryPath = path.join(dir, entry.name);
          if (entry.name.toLowerCase().includes(query)) {
            try {
              results.push(getEntryStats(entryPath, entry.name));
            } catch (e) { /* skip */ }
          }
          if (entry.isDirectory()) {
            walkDir(entryPath);
          }
        }
      } catch (e) { /* skip */ }
    }

    walkDir(searchDir);

    // Limit results
    const limited = results.slice(0, 100);

    res.json({
      query: q,
      results: limited,
      total: results.length,
      truncated: results.length > 100
    });
  } catch (err) {
    console.error('[Search] Error:', err);
    res.status(500).json({ error: '搜索失败: ' + err.message });
  }
});

module.exports = router;
