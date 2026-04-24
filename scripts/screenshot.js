/**
 * 页面截图工具
 * 用法: node scripts/screenshot.js [URL] [输出路径]
 */

const { chromium } = require('playwright');
const path = require('path');

async function screenshot(url, outputPath) {
  if (!url) {
    url = 'http://localhost:8090/tools/video';
  }
  if (!outputPath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    outputPath = path.join('/tmp', `screenshot-${timestamp}.png`);
  }

  console.log(`正在截图: ${url}`);
  console.log(`保存路径: ${outputPath}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();
  
  // 等待页面加载
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  
  // 等待一下让 Vue 渲染完成
  await page.waitForTimeout(2000);
  
  // 全屏截图
  await page.screenshot({ path: outputPath, fullPage: true });
  
  console.log(`✅ 截图已保存: ${outputPath}`);
  
  await browser.close();
  return outputPath;
}

// 如果直接运行
if (require.main === module) {
  const url = process.argv[2] || 'http://localhost:8090/tools/video';
  const outputPath = process.argv[3];
  screenshot(url, outputPath).catch(console.error);
}

module.exports = { screenshot };
