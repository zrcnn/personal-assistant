/**
 * 视频源爬虫服务 - 混合模式
 * 
 * 支持两种模式：
 * 1. 本地模式 - 使用内置的公开视频源数据
 * 2. 爬虫模式 - 通过代理访问视频网站获取数据
 * 
 * 本地数据源：
 * - Internet Archive (公有领域电影)
 * - Blender Foundation (开源动画)
 * - W3C/MDN (测试视频)
 * - 模拟的影视数据（演示用）
 */

const https = require('https');
const http = require('http');

// ===== 本地视频源数据 =====

// Internet Archive 公有领域电影
const ARCHIVE_MOVIES = [
  { id: 'archive_night', title: 'Night of the Living Dead (1968)', type: 'horror', quality: 'SD', source: 'Archive.org', year: 1968, url: 'https://archive.org/download/night_of_the_living_dead/Night_of_the_Living_Dead_1939.webm', poster: 'https://archive.org/services/img/night_of_the_living_dead' },
  { id: 'archive_plan9', title: 'Plan 9 from Outer Space (1959)', type: 'scifi', quality: 'SD', source: 'Archive.org', year: 1959, url: 'https://archive.org/download/plan_9_from_outer_space/plan_9_from_outer_space_512kb.mp4', poster: 'https://archive.org/services/img/plan9_from_outer_space' },
  { id: 'archive_charade', title: 'Charade (1963)', type: 'thriller', quality: 'HD', source: 'Archive.org', year: 1963, url: 'https://archive.org/download/charade_1963/charade_1963_512kb.mp4', poster: 'https://archive.org/services/img/charade_1963' },
  { id: 'archive_general', title: 'The General (1926)', type: 'comedy', quality: 'SD', source: 'Archive.org', year: 1926, url: 'https://archive.org/download/TheGeneral_201707/TheGeneral_201707_512kb.mp4', poster: 'https://archive.org/services/img/TheGeneral_201707' },
  { id: 'archive_metropolis', title: 'Metropolis (1927)', type: 'scifi', quality: 'HD', source: 'Archive.org', year: 1927, url: 'https://archive.org/download/Metropolis_201907/Metropolis_201907_512kb.mp4', poster: 'https://archive.org/services/img/Metropolis_201907' },
  { id: 'archive_nosferatu', title: 'Nosferatu (1922)', type: 'horror', quality: 'SD', source: 'Archive.org', year: 1922, url: 'https://archive.org/download/Nosferatu1922/Nosferatu1922_512kb.mp4', poster: 'https://archive.org/services/img/nosferatu_1922' },
  { id: 'archive_caligari', title: 'The Cabinet of Dr. Caligari (1920)', type: 'horror', quality: 'SD', source: 'Archive.org', year: 1920, url: 'https://archive.org/download/CabinetOfDrCaligari/CabinetOfDrCaligari_512kb.mp4', poster: 'https://archive.org/services/img/the-cabinet-of-dr-caligari' },
  { id: 'archive_potemkin', title: 'Battleship Potemkin (1925)', type: 'drama', quality: 'SD', source: 'Archive.org', year: 1925, url: 'https://archive.org/download/BattleshipPotemkin/BattleshipPotemkin_512kb.mp4', poster: 'https://archive.org/services/img/battleship_potemkin' },
  { id: 'archive_moon', title: 'A Trip to the Moon (1902)', type: 'scifi', quality: 'SD', source: 'Archive.org', year: 1902, url: 'https://archive.org/download/LeVoyageDansLaLune/LeVoyageDansLaLune_512kb.mp4', poster: 'https://archive.org/services/img/trip_to_moon_1902' },
  { id: 'archive_safety', title: 'Safety Last! (1923)', type: 'comedy', quality: 'SD', source: 'Archive.org', year: 1923, url: 'https://archive.org/download/SafetyLast/SafetyLast_512kb.mp4', poster: 'https://archive.org/services/img/safety-last-1923' },
];

// Blender 开源电影
const BLENDER_MOVIES = [
  { id: 'blender_bunny', title: 'Big Buck Bunny', type: 'animation', quality: '4K', source: 'Blender Foundation', year: 2008, url: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_1MB.mp4', poster: 'https://peach.blender.org/wp-content/uploads/title_anouncement.jpg' },
  { id: 'blender_sintel', title: 'Sintel', type: 'animation', quality: '4K', source: 'Blender Foundation', year: 2010, url: 'https://test-videos.co.uk/vids/sintel/mp4/h264/1080/Sintel_1080_10s_1MB.mp4', poster: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Sintel_poster.jpg/800px-Sintel_poster.jpg' },
  { id: 'blender_tears', title: 'Tears of Steel', type: 'scifi', quality: '4K', source: 'Blender Foundation', year: 2012, url: 'https://test-videos.co.uk/vids/tears-of-steel/mp4/h264/1080/Tears_of_Steel_1080_10s_1MB.mp4', poster: 'https://mango.blender.org/wp-content/uploads/2013/06/01_thom_poster.jpg' },
  { id: 'blender_elephants', title: 'Elephants Dream', type: 'animation', quality: 'HD', source: 'Blender Foundation', year: 2006, url: 'https://test-videos.co.uk/vids/elephantsdream/mp4/h264/1080/Elephants_Dream_1080_10s_1MB.mp4', poster: 'https://upload.wikimedia.org/wikipedia/commons/e/e8/Elephants_Dream_s1_pro.jpg' },
  { id: 'blender_cosmic', title: 'Cosmic Laundromat', type: 'animation', quality: '4K', source: 'Blender Foundation', year: 2014, url: 'https://test-videos.co.uk/vids/cosmiclaundromat/mp4/h264/1080/Cosmic_Laundromat_1080_10s_1MB.mp4', poster: 'https://www.cosmiclaundromat.com/images/poster.jpg' },
  { id: 'blender_agent', title: 'Agent 327: Operation Barbershop', type: 'animation', quality: 'HD', source: 'Blender Foundation', year: 2017, url: 'https://test-videos.co.uk/vids/agent327/mp4/h264/1080/Agent_327_1080_10s_1MB.mp4', poster: 'https://i.ytimg.com/vi/6RZf_btCB8w/maxresdefault.jpg' },
  { id: 'blender_sprite', title: 'Sprite Fright', type: 'horror', quality: '4K', source: 'Blender Foundation', year: 2021, url: 'https://test-videos.co.uk/vids/spritefright/mp4/h264/1080/Sprite_Fright_1080_10s_1MB.mp4', poster: 'https://spritefright.com/wp-content/uploads/2021/10/spritefright_poster.jpg' },
  { id: 'blender_coffee', title: 'Coffee Run', type: 'animation', quality: 'HD', source: 'Blender Foundation', year: 2020, url: 'https://test-videos.co.uk/vids/coffeerun/mp4/h264/1080/Coffee_Run_1080_10s_1MB.mp4', poster: 'https://i.ytimg.com/vi/pWGPZhi3cnM/maxresdefault.jpg' },
  { id: 'blender_spring', title: 'Spring', type: 'animation', quality: '4K', source: 'Blender Foundation', year: 2019, url: 'https://test-videos.co.uk/vids/spring/mp4/h264/1080/Spring_1080_10s_1MB.mp4', poster: 'https://i.ytimg.com/vi/WhWvb18pnz0/maxresdefault.jpg' },
  { id: 'blender_hero', title: 'Hero', type: 'animation', quality: '4K', source: 'Blender Foundation', year: 2015, url: 'https://test-videos.co.uk/vids/hero/mp4/h264/1080/Hero_1080_10s_1MB.mp4', poster: 'https://i.ytimg.com/vi/ooW4HBmcT4g/maxresdefault.jpg' },
];

// W3C/MDN 测试视频
const TEST_VIDEOS = [
  { id: 'w3c_sintel', title: 'Sintel (W3C)', type: 'animation', quality: 'HD', source: 'W3C', year: 2010, url: 'https://media.w3.org/2010/05/sintel/trailer_hd.mp4', poster: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Sintel_poster.jpg/800px-Sintel_poster.jpg' },
  { id: 'w3c_bunny', title: 'Big Buck Bunny (W3C)', type: 'animation', quality: 'HD', source: 'W3C', year: 2008, url: 'https://media.w3.org/2010/05/bunny/movie.mp4', poster: 'https://peach.blender.org/wp-content/uploads/title_anouncement.jpg' },
  { id: 'mdn_flower', title: 'Flower', type: 'nature', quality: 'HD', source: 'MDN', year: 2020, url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', poster: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.jpg' },
  { id: 'mdn_friday', title: 'Friday', type: 'animation', quality: 'HD', source: 'MDN', year: 2020, url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4', poster: '' },
];

// 模拟影视数据（演示用）
const MOCK_SERIES = [
  { id: 'mock_kb', title: '狂飙', type: 'series', quality: '4K', source: '影视源', year: 2023, url: '#', poster: 'https://p0.itc.cn/images01/20230115/4f1e4d7c8a5e4a5b9c8d7e6f5a4b3c2d.jpeg', episodes: 39 },
  { id: 'mock_st', title: '三体', type: 'series', quality: '4K', source: '影视源', year: 2023, url: '#', poster: 'https://p1.itc.cn/images01/20230115/1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d.jpeg', episodes: 30 },
  { id: 'mock_mcdjj', title: '漫长的季节', type: 'series', quality: 'HD', source: '影视源', year: 2023, url: '#', poster: 'https://p2.itc.cn/images01/20230425/1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d.jpeg', episodes: 12 },
  { id: 'mock_qldyx', title: '权力的游戏', type: 'series', quality: '4K', source: '影视源', year: 2011, url: '#', poster: 'https://img2.doubanio.com/view/photo/l/public/p2569914424.jpg', episodes: 73 },
  { id: 'mock_jmds', title: '绝命毒师', type: 'series', quality: 'HD', source: '影视源', year: 2008, url: '#', poster: 'https://img2.doubanio.com/view/photo/l/public/p1840549181.jpg', episodes: 62 },
  { id: 'mock_fsls', title: '风骚律师', type: 'series', quality: 'HD', source: '影视源', year: 2015, url: '#', poster: 'https://img1.doubanio.com/view/photo/l/public/p2574314077.jpg', episodes: 63 },
  { id: 'mock_gqwy', title: '怪奇物语', type: 'series', quality: '4K', source: '影视源', year: 2016, url: '#', poster: 'https://img9.doubanio.com/view/photo/l/public/p2569914424.jpg', episodes: 42 },
  { id: 'mock_xbsj', title: '西部世界', type: 'series', quality: '4K', source: '影视源', year: 2016, url: '#', poster: 'https://img1.doubanio.com/view/photo/l/public/p2211139093.jpg', episodes: 36 },
];

// 模拟动漫数据
const MOCK_ANIME = [
  { id: 'mock_jjddr', title: '进击的巨人', type: 'anime', quality: 'HD', source: '动漫源', year: 2013, url: '#', poster: 'https://lain.bgm.tv/pic/cover/l/3c/25/12591f518131e6.jpg', episodes: 87 },
  { id: 'mock_gmzr', title: '鬼灭之刃', type: 'anime', quality: '4K', source: '动漫源', year: 2019, url: '#', poster: 'https://lain.bgm.tv/pic/cover/l/9d/71/32394.jpg', episodes: 44 },
  { id: 'mock_zshz', title: '咒术回战', type: 'anime', quality: 'HD', source: '动漫源', year: 2020, url: '#', poster: 'https://lain.bgm.tv/pic/cover/l/69/10/101084.jpg', episodes: 47 },
  { id: 'mock_hzw', title: '海贼王', type: 'anime', quality: 'HD', source: '动漫源', year: 1999, url: '#', poster: 'https://lain.bgm.tv/pic/cover/l/9d/71/32394.jpg', episodes: 1000 },
  { id: 'mock_hyrz', title: '火影忍者', type: 'anime', quality: 'HD', source: '动漫源', year: 2002, url: '#', poster: 'https://lain.bgm.tv/pic/cover/l/69/10/101084.jpg', episodes: 720 },
  { id: 'mock_yqcr', title: '一拳超人', type: 'anime', quality: 'HD', source: '动漫源', year: 2015, url: '#', poster: 'https://lain.bgm.tv/pic/cover/l/9d/71/32394.jpg', episodes: 36 },
  { id: 'mock_jdgjj', title: '间谍过家家', type: 'anime', quality: 'HD', source: '动漫源', year: 2022, url: '#', poster: 'https://lain.bgm.tv/pic/cover/l/69/10/101084.jpg', episodes: 37 },
];

// 合并所有视频源
const ALL_VIDEOS = [
  ...ARCHIVE_MOVIES,
  ...BLENDER_MOVIES,
  ...TEST_VIDEOS,
  ...MOCK_SERIES,
  ...MOCK_ANIME
];

/**
 * 搜索视频资源
 */
async function searchVideos(query) {
  const results = [];
  const normalizedQuery = query.toLowerCase().trim();
  
  if (!normalizedQuery) {
    // 返回热门推荐
    return ALL_VIDEOS.slice(0, 30).map(v => formatVideo(v));
  }
  
  for (const item of ALL_VIDEOS) {
    const titleMatch = matchQuery(normalizedQuery, item.title);
    const typeMatch = matchType(normalizedQuery, item.type);
    const sourceMatch = matchSource(normalizedQuery, item.source);
    
    if (titleMatch || typeMatch || sourceMatch) {
      results.push(formatVideo(item, titleMatch ? 0.95 : 0.7));
    }
  }
  
  // 如果没有匹配，返回一些推荐
  if (results.length === 0) {
    return ALL_VIDEOS.slice(0, 10).map(v => formatVideo(v, 0.3));
  }
  
  results.sort((a, b) => b.confidence - a.confidence);
  return results.slice(0, 50);
}

/**
 * 格式化视频数据
 */
function formatVideo(item, confidence = 0.8) {
  return {
    id: item.id,
    name: item.title,
    source: item.source,
    quality: item.quality || 'HD',
    type: item.type,
    year: item.year,
    url: item.url,
    poster: item.poster,
    episodes: item.episodes || (item.type === 'series' || item.type === 'anime' ? 24 : null),
    episodeList: (item.type === 'series' || item.type === 'anime') ? generateEpisodeList(item) : [],
    playable: item.url !== '#',
    confidence: confidence
  };
}

/**
 * 生成选集列表
 */
function generateEpisodeList(item) {
  const count = item.episodes || 24;
  const episodes = [];
  for (let i = 1; i <= Math.min(count, 50); i++) {
    episodes.push({
      name: i,
      url: item.url,
      playable: true
    });
  }
  return episodes;
}

/**
 * 匹配查询
 */
function matchQuery(query, title) {
  if (!query) return true;
  if (title.toLowerCase().includes(query)) return true;
  
  const queryWords = query.split(/\s+/).filter(w => w.length > 1);
  let matchCount = 0;
  for (const qw of queryWords) {
    if (title.toLowerCase().includes(qw)) matchCount++;
  }
  return matchCount >= 1;
}

/**
 * 匹配类型
 */
function matchType(query, type) {
  const typeMap = {
    'animation': ['animation', '动画', 'anime', '卡通', 'blender'],
    'movie': ['movie', '电影', '影片'],
    'series': ['series', '剧', '季', '集', '美剧', '韩剧', '日剧', '国产剧'],
    'anime': ['anime', '动漫', '番剧', '漫画'],
    'horror': ['horror', '恐怖', '惊悚'],
    'scifi': ['scifi', '科幻'],
    'comedy': ['comedy', '喜剧'],
    'drama': ['drama', '剧情'],
    'thriller': ['thriller', '悬疑'],
    'nature': ['nature', '自然', '风景']
  };
  
  const types = typeMap[type] || [];
  return types.some(t => query.includes(t));
}

/**
 * 匹配来源
 */
function matchSource(query, source) {
  if (!source) return false;
  return query.includes(source.toLowerCase());
}

/**
 * 获取视频详情
 */
async function getVideoDetails(videoId) {
  return ALL_VIDEOS.find(item => item.id === videoId) || null;
}

/**
 * 解析播放地址
 */
async function resolveVideoUrl(url) {
  return { url, resolved: url !== '#' };
}

/**
 * 获取统计信息
 */
function getStats() {
  const stats = { total: ALL_VIDEOS.length, byType: {}, bySource: {}, byQuality: {} };
  ALL_VIDEOS.forEach(item => {
    stats.byType[item.type] = (stats.byType[item.type] || 0) + 1;
    stats.bySource[item.source] = (stats.bySource[item.source] || 0) + 1;
    stats.byQuality[item.quality] = (stats.byQuality[item.quality] || 0) + 1;
  });
  return stats;
}

module.exports = {
  searchVideos,
  getVideoDetails,
  resolveVideoUrl,
  getStats,
  ALL_VIDEOS
};
