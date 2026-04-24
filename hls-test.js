const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  // 直接用 HTML5 video 标签测试 HLS
  await page.setContent(`
  <!DOCTYPE html>
  <html>
  <body>
    <h3>Test 1: Native HTML5 video with m3u8 (HLS)</h3>
    <video id="v1" controls width="640" height="360">
      <source src="https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" type="application/x-mpegURL">
    </video>
    
    <h3>Test 2: Direct MP4</h3>
    <video id="v2" controls width="640" height="360">
      <source src="https://www.w3schools.com/html/mov_bbb.mp4" type="video/mp4">
    </video>
  </body>
  </html>
  `);
  
  await page.waitForTimeout(5000);
  
  const result = await page.evaluate(() => {
    const videos = document.querySelectorAll('video');
    return Array.from(videos).map((v) => ({
      src: v.currentSrc,
      readyState: v.readyState,
      error: v.error?.message,
      errorCode: v.error?.code,
      videoWidth: v.videoWidth,
      videoHeight: v.videoHeight
    }));
  });
  
  console.log('视频测试结果:', JSON.stringify(result, null, 2));
  
  await page.screenshot({ path: '/tmp/hls-test.png' });
  console.log('截图已保存: /tmp/hls-test.png');
  
  await browser.close();
})()
