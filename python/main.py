#!/usr/bin/env python3
"""
PA 股票分析服务 - FastAPI
提供实时行情、技术分析、自选股管理等功能
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
import random
import time
import json
import os
import re
from datetime import datetime, timedelta
from typing import Optional
import pymysql
from contextlib import contextmanager

app = FastAPI(title="PA Stock Service", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============ Config ============
MYSQL_HOST = os.getenv("MYSQL_HOST", "127.0.0.1")
MYSQL_PORT = int(os.getenv("MYSQL_PORT", "3306"))
MYSQL_USER = os.getenv("MYSQL_USER", "pa")
MYSQL_PASS = os.getenv("MYSQL_PASS", "pa_pass_2026")
MYSQL_DB = os.getenv("MYSQL_DB", "personal_assistant")

@contextmanager
def get_db():
    conn = pymysql.connect(
        host=MYSQL_HOST, port=MYSQL_PORT,
        user=MYSQL_USER, password=MYSQL_PASS,
        database=MYSQL_DB, charset='utf8mb4',
        cursorclass=pymysql.cursors.DictCursor
    )
    try:
        yield conn
    finally:
        conn.close()

# ============ Stock Data Sources ============

class StockCrawler:
    """多数据源股票爬虫"""

    DATA_SOURCES = {
        'tencent': 'http://qt.gtimg.cn/q=',
        'sina': 'http://hq.sinajs.cn/list=',
        'eastmoney': 'http://push2.eastmoney.com/api/qt/clist/get'
    }

    def __init__(self):
        self.cache = {}
        self.cache_ttl = 30  # 30秒缓存

    def _is_cached(self, code):
        if code in self.cache:
            entry = self.cache[code]
            if time.time() - entry['time'] < self.cache_ttl:
                return entry['data']
        return None

    def _set_cache(self, code, data):
        self.cache[code] = {'data': data, 'time': time.time()}

    def _crawl_tencent(self, code):
        """腾讯财经数据源"""
        try:
            url = f"{self.DATA_SOURCES['tencent']}{code}"
            headers = {'Referer': 'https://gu.qq.com/'}
            resp = requests.get(url, headers=headers, timeout=5)
            resp.encoding = 'gbk'
            text = resp.text.strip()
            if not text or '~' not in text:
                return None

            parts = text.split('~')
            if len(parts) < 50:
                return None

            # 判断涨跌
            current = float(parts[3])
            prev_close = float(parts[4])
            change = current - prev_close
            change_pct = (change / prev_close * 100) if prev_close > 0 else 0

            return {
                'code': code,
                'name': parts[1],
                'current_price': current,
                'prev_close': prev_close,
                'open': float(parts[5]),
                'high': float(parts[33]),
                'low': float(parts[34]),
                'volume': int(parts[6]),
                'amount': float(parts[37]) if len(parts) > 37 and parts[37] else 0,
                'change': round(change, 2),
                'change_pct': round(change_pct, 2),
                'turnover_rate': float(parts[38]) if len(parts) > 38 and parts[38] else 0,
                'pe_ratio': float(parts[39]) if len(parts) > 39 and parts[39] else 0,
                'market_cap': float(parts[44]) if len(parts) > 44 and parts[44] else 0,
                'source': 'tencent',
                'crawl_time': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            }
        except Exception as e:
            print(f"[Tencent] Error fetching {code}: {e}")
            return None

    def _crawl_sina(self, code):
        """新浪财经数据源"""
        try:
            url = f"{self.DATA_SOURCES['sina']}{code}"
            resp = requests.get(url, timeout=5)
            resp.encoding = 'gbk'
            text = resp.text.strip()

            match = re.search(r'="(.+)"', text)
            if not match:
                return None

            parts = match.group(1).split(',')
            if len(parts) < 32 or parts[0] == '':
                return None

            current = float(parts[3])
            prev_close = float(parts[2])
            change = current - prev_close
            change_pct = (change / prev_close * 100) if prev_close > 0 else 0

            return {
                'code': code,
                'name': parts[0],
                'current_price': current,
                'prev_close': prev_close,
                'open': float(parts[1]),
                'high': float(parts[4]),
                'low': float(parts[5]),
                'volume': int(parts[8]),
                'amount': float(parts[9]),
                'change': round(change, 2),
                'change_pct': round(change_pct, 2),
                'turnover_rate': 0,
                'pe_ratio': 0,
                'market_cap': 0,
                'source': 'sina',
                'crawl_time': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            }
        except Exception as e:
            print(f"[Sina] Error fetching {code}: {e}")
            return None

    def _crawl_eastmoney_search(self, keyword):
        """东方财富搜索"""
        try:
            url = "http://push2.eastmoney.com/api/qt/slist/get"
            params = {
                'secid': '',
                'fields': 'f12,f14',
                'ut': 'bd1d9ddb04089700cf9c27f6f7426281',
                'fltt': '2',
                'invt': '2',
                'pn': '1',
                'pz': '10',
                'po': '1',
                'np': '1',
                'fs': 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23',
                'cb': ''
            }
            # Search by keyword
            url = f"http://searchapi.eastmoney.com/api/suggest/get?input={keyword}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8"
            resp = requests.get(url, timeout=5)
            data = resp.json()
            results = []
            for item in data.get('QuotationCodeTable', {}).get('Data', []):
                code = item.get('Code', '')
                name = item.get('Name', '')
                mkt = item.get('MktNum', '0')
                # Convert to standard format
                prefix = 'sh' if mkt == '1' else 'sz'
                full_code = f"{prefix}{code}"
                results.append({
                    'code': full_code,
                    'name': name,
                    'market': prefix.upper()
                })
            return results[:5]
        except Exception as e:
            print(f"[EastMoney Search] Error: {e}")
            return []

    def get_realtime(self, code):
        """获取实时行情（多源重试）"""
        cached = self._is_cached(code)
        if cached:
            return cached

        # 尝试多个数据源
        for crawler in [self._crawl_tencent, self._crawl_sina]:
            try:
                data = crawler(code)
                if data and data.get('current_price') and data['current_price'] > 0:
                    self._set_cache(code, data)
                    return data
            except:
                continue

        return None

    def search(self, keyword):
        """搜索股票"""
        return self._crawl_eastmoney_search(keyword)

    def normalize_code(self, code):
        """标准化股票代码格式"""
        code = code.upper().strip()
        # Pure number -> guess market
        if code.isdigit():
            if code.startswith('6'):
                code = f'sh{code}'
            elif code.startswith('0') or code.startswith('3'):
                code = f'sz{code}'
            elif code.startswith('8') or code.startswith('4'):
                code = f'bj{code}'
            else:
                code = f'sz{code}'
        # Already has prefix
        elif not code.startswith(('SH', 'SZ', 'BJ', 'sh', 'sz', 'bj')):
            code = f'sz{code}'
        return code.lower()

    def to_eastmoney_secid(self, code):
        """转换为东方财富 secid 格式 (market.code)"""
        code = self.normalize_code(code)
        if code.startswith('sh'):
            return f'1.{code[2:]}'
        elif code.startswith('sz'):
            return f'0.{code[2:]}'
        elif code.startswith('bj'):
            return f'0.{code[2:]}'
        return f'0.{code}'

    def get_kline(self, code, klt=101, count=100):
        """获取K线数据
        klt: 101=日K, 102=周K, 104=月K
        count: 获取条数
        返回: [{date, open, close, high, low, volume, amount, change_pct}]
        """
        code = self.normalize_code(code)
        secid = self.to_eastmoney_secid(code)

        try:
            url = 'http://push2his.eastmoney.com/api/qt/stock/kline/get'
            params = {
                'secid': secid,
                'klt': klt,
                'fqt': 1,  # 前复权
                'beg': '0',
                'end': datetime.now().strftime('%Y%m%d'),
                'fields1': 'f1,f2,f3,f4,f5,f6',
                'fields2': 'f51,f52,f53,f54,f55,f56,f57,f58',
            }
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://quote.eastmoney.com/',
            }
            resp = requests.get(url, params=params, headers=headers, timeout=10)
            data = resp.json()

            if not data.get('data') or not data['data'].get('klines'):
                return []

            klines = data['data']['klines'][-count:]  # 取最近 count 条
            result = []
            for kl in klines:
                parts = kl.split(',')
                # f51=日期, f52=开盘, f53=收盘, f54=最高, f55=最低, f56=成交量, f57=成交额, f58=振幅
                result.append({
                    'date': parts[0],
                    'open': float(parts[1]) if parts[1] else 0,
                    'close': float(parts[2]) if parts[2] else 0,
                    'high': float(parts[3]) if parts[3] else 0,
                    'low': float(parts[4]) if parts[4] else 0,
                    'volume': int(parts[5]) if parts[5] else 0,
                    'amount': float(parts[6]) if parts[6] else 0,
                    'change_pct': float(parts[7]) if parts[7] else 0,
                })
            return result
        except Exception as e:
            print(f"[Kline] Error fetching {code}: {e}")
            return []

    def get_market_indices(self):
        """获取主要市场指数和板块走势"""
        indices = [
            {'secid': '1.000001', 'name': '上证指数', 'code': 'sh000001'},
            {'secid': '0.399001', 'name': '深证成指', 'code': 'sz399001'},
            {'secid': '0.399006', 'name': '创业板指', 'code': 'sz399006'},
            {'secid': '1.000688', 'name': '科创50', 'code': 'sh000688'},
            {'secid': '1.000300', 'name': '沪深300', 'code': 'sh000300'},
        ]

        results = []
        for idx in indices:
            try:
                url = 'http://push2his.eastmoney.com/api/qt/stock/kline/get'
                params = {
                    'secid': idx['secid'],
                    'klt': 101,
                    'fqt': 0,
                    'beg': '0',
                    'end': datetime.now().strftime('%Y%m%d'),
                    'fields1': 'f1,f2,f3,f4,f5,f6',
                    'fields2': 'f51,f52,f53,f54,f55,f56,f57,f58',
                }
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://quote.eastmoney.com/',
                }
                resp = requests.get(url, params=params, headers=headers, timeout=10)
                data = resp.json()

                klines = data.get('data', {}).get('klines', [])
                if klines:
                    latest = klines[-1].split(',')
                    prev = klines[-2].split(',') if len(klines) >= 2 else latest
                    results.append({
                        'name': idx['name'],
                        'code': idx['code'],
                        'current': float(latest[2]) if latest[2] else 0,
                        'change_pct': float(latest[7]) if latest[7] else 0,
                        'trend': 'up' if float(latest[7]) >= 0 else 'down',
                        'kline': [
                            {'date': kl.split(',')[0], 'close': float(kl.split(',')[2])}
                            for kl in klines[-20:]  # 最近20天走势
                        ]
                    })
            except Exception as e:
                print(f"[Indices] Error fetching {idx['name']}: {e}")
                continue

        return results

    def get_sector_heatmap(self):
        """获取行业板块涨跌幅"""
        try:
            url = 'http://push2.eastmoney.com/api/qt/clist/get'
            params = {
                'pn': '1', 'pz': '30', 'po': '1', 'np': '1',
                'ut': 'bd1d9ddb04089700cf9c27f6f7426281',
                'fltt': '2', 'invt': '2', 'fid': 'f3',
                'fs': 'm:90+t:1',  # 行业板块
                'fields': 'f12,f14,f2,f3',
            }
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://quote.eastmoney.com/',
            }
            resp = requests.get(url, params=params, headers=headers, timeout=10)
            data = resp.json()

            results = []
            for item in data.get('data', {}).get('diff', []):
                results.append({
                    'name': item.get('f14', ''),
                    'code': item.get('f12', ''),
                    'current': item.get('f2', 0),
                    'change_pct': item.get('f3', 0),
                    'trend': 'up' if item.get('f3', 0) >= 0 else 'down',
                })
            return results[:20]  # 取前20个行业
        except Exception as e:
            print(f"[Sector] Error: {e}")
            return []

    def get_sector_kline(self, code, count=20):
        """获取板块K线数据
        code: 板块代码 (如 BK0491)
        count: 获取条数
        返回: [{date, open, close, high, low, volume, amount, change_pct}]
        """
        try:
            # 板块代码转 secid 格式：板块用 m:90+t:2+{code}
            secid = f'm:90+t:2+{code}'
            url = 'http://push2his.eastmoney.com/api/qt/stock/kline/get'
            params = {
                'secid': secid,
                'klt': 101,
                'fqt': 0,
                'beg': '0',
                'end': datetime.now().strftime('%Y%m%d'),
                'fields1': 'f1,f2,f3,f4,f5,f6',
                'fields2': 'f51,f52,f53,f54,f55,f56,f57,f58',
            }
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://quote.eastmoney.com/',
            }
            resp = requests.get(url, params=params, headers=headers, timeout=10)
            data = resp.json()

            if not data.get('data') or not data['data'].get('klines'):
                return []

            klines = data['data']['klines'][-count:]
            result = []
            for kl in klines:
                parts = kl.split(',')
                result.append({
                    'date': parts[0],
                    'open': float(parts[1]) if parts[1] else 0,
                    'close': float(parts[2]) if parts[2] else 0,
                    'high': float(parts[3]) if parts[3] else 0,
                    'low': float(parts[4]) if parts[4] else 0,
                    'volume': int(parts[5]) if parts[5] else 0,
                    'amount': float(parts[6]) if parts[6] else 0,
                    'change_pct': float(parts[7]) if parts[7] else 0,
                })
            return result
        except Exception as e:
            print(f"[Sector Kline] Error fetching {code}: {e}")
            return []


crawler = StockCrawler()

# ============ Technical Indicators ============

class TechnicalAnalyzer:
    """技术指标分析"""

    @staticmethod
    def calc_ma(prices, period):
        if len(prices) < period:
            return None
        return round(sum(prices[-period:]) / period, 2)

    @staticmethod
    def calc_macd(prices, short=12, long=26, signal=9):
        if len(prices) < long + signal:
            return None
        ema_short = prices[0]
        ema_long = prices[0]
        dif_list = []

        for p in prices:
            ema_short = (p * 2 + ema_short * (short - 1)) / (short + 1)
            ema_long = (p * 2 + ema_long * (long - 1)) / (long + 1)
            dif_list.append(ema_short - ema_long)

        dea = dif_list[0]
        macd_list = []
        for d in dif_list:
            dea = (d * 2 + dea * (signal - 1)) / (signal + 1)
            macd_list.append((d - dea) * 2)

        dif = round(dif_list[-1], 3)
        dea_val = round(dea, 3)
        macd_val = round(macd_list[-1], 3)

        if dif > 0 and dea_val > 0:
            signal_type = 'bullish'  # 多头
        elif dif < 0 and dea_val < 0:
            signal_type = 'bearish'  # 空头
        elif dif > 0 and dea_val < 0:
            signal_type = 'golden_cross'  # 金叉
        else:
            signal_type = 'death_cross'  # 死叉

        return {
            'dif': dif, 'dea': dea_val, 'macd': macd_val,
            'signal': signal_type,
            'signal_name': {'bullish': '多头', 'bearish': '空头', 'golden_cross': '金叉', 'death_cross': '死叉'}[signal_type]
        }

    @staticmethod
    def calc_rsi(prices, period=14):
        if len(prices) < period + 1:
            return None
        gains = []
        losses = []
        for i in range(1, len(prices)):
            diff = prices[i] - prices[i-1]
            if diff > 0:
                gains.append(diff)
                losses.append(0)
            else:
                gains.append(0)
                losses.append(abs(diff))

        avg_gain = sum(gains[:period]) / period
        avg_loss = sum(losses[:period]) / period

        for i in range(period, len(gains)):
            avg_gain = (avg_gain * (period - 1) + gains[i]) / period
            avg_loss = (avg_loss * (period - 1) + losses[i]) / period

        if avg_loss == 0:
            return {'rsi': 100, 'signal': 'overbought', 'signal_name': '超买'}
        rs = avg_gain / avg_loss
        rsi = round(100 - (100 / (1 + rs)), 2)

        if rsi >= 80:
            signal = 'overbought'
            name = '超买'
        elif rsi >= 70:
            signal = 'strong'
            name = '强势'
        elif rsi <= 20:
            signal = 'oversold'
            name = '超卖'
        elif rsi <= 30:
            signal = 'weak'
            name = '弱势'
        else:
            signal = 'neutral'
            name = '中性'

        return {'rsi': rsi, 'signal': signal, 'signal_name': name}

    @staticmethod
    def calc_kdj(highs, lows, closes, n=9):
        if len(closes) < n:
            return None
        rsv = (closes[-1] - min(lows[-n:])) / (max(highs[-n:]) - min(lows[-n:])) * 100 if max(highs[-n:]) != min(lows[-n:]) else 50
        k = 50
        d = 50
        j = 50
        for i in range(len(closes) - n, len(closes)):
            hh = max(highs[i-n+1:i+1]) if i >= n-1 else max(highs[:i+1])
            ll = min(lows[i-n+1:i+1]) if i >= n-1 else min(lows[:i+1])
            rsv_val = (closes[i] - ll) / (hh - ll) * 100 if hh != ll else 50
            k = (2/3) * k + (1/3) * rsv_val
            d = (2/3) * d + (1/3) * k
            j = 3 * k - 2 * d

        return {'k': round(k, 2), 'd': round(d, 2), 'j': round(j, 2),
                'signal': 'golden' if k > d else 'dead',
                'signal_name': '金叉' if k > d else '死叉'}

    @staticmethod
    def calc_bollinger(prices, period=20):
        if len(prices) < period:
            return None
        ma = sum(prices[-period:]) / period
        std = (sum((p - ma)**2 for p in prices[-period:]) / period) ** 0.5
        upper = round(ma + 2 * std, 2)
        middle = round(ma, 2)
        lower = round(ma - 2 * std, 2)

        current = prices[-1]
        if current >= upper:
            pos = 'above'
            name = '突破上轨'
        elif current <= lower:
            pos = 'below'
            name = '跌破下轨'
        elif current > middle:
            pos = 'upper_half'
            name = '中轨上方'
        else:
            pos = 'lower_half'
            name = '中轨下方'

        return {'upper': upper, 'middle': middle, 'lower': lower, 'position': pos, 'signal_name': name}

    @classmethod
    def generate_report(cls, stock_data):
        """生成综合分析报告"""
        if not stock_data:
            return None

        # Use current price as single-point data
        price = stock_data.get('current_price', 0)
        change_pct = stock_data.get('change_pct', 0)

        report = {
            'stock': stock_data,
            'indicators': {},
            'score': 50,
            'recommendation': '观望',
            'recommendation_color': 'neutral'
        }

        # Simple indicators based on available data
        rsi = cls.calc_rsi([price] * 15)  # Placeholder with limited data
        if rsi:
            report['indicators']['rsi'] = rsi

        # Scoring based on change_pct
        if change_pct > 5:
            report['score'] = 80
            report['recommendation'] = '强势上涨'
            report['recommendation_color'] = 'bullish'
        elif change_pct > 2:
            report['score'] = 70
            report['recommendation'] = '偏多'
            report['recommendation_color'] = 'bullish'
        elif change_pct < -5:
            report['score'] = 20
            report['recommendation'] = '大幅下跌'
            report['recommendation_color'] = 'bearish'
        elif change_pct < -2:
            report['score'] = 35
            report['recommendation'] = '偏空'
            report['recommendation_color'] = 'bearish'
        else:
            report['score'] = 50
            report['recommendation'] = '震荡观望'
            report['recommendation_color'] = 'neutral'

        return report

analyzer = TechnicalAnalyzer()

# ============ Models ============

class WatchlistAdd(BaseModel):
    code: str

class WatchlistRemove(BaseModel):
    code: str

# ============ Init DB Tables ============

def ensure_tables():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS watchlist (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    stock_code VARCHAR(20) NOT NULL,
                    stock_name VARCHAR(100),
                    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_user_stock (user_id, stock_code),
                    INDEX idx_user_id (user_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)
        conn.commit()

# ============ API Routes ============

@app.get("/api/stock/search")
async def search_stock(keyword: str = Query(..., min_length=1)):
    """搜索股票"""
    results = crawler.search(keyword)
    if not results:
        # 尝试直接作为代码查询
        code = crawler.normalize_code(keyword)
        data = crawler.get_realtime(code)
        if data:
            results = [{'code': data['code'], 'name': data['name'], 'market': data['code'][:2].upper()}]
    return {'results': results}

@app.get("/api/stock/realtime")
async def get_realtime(code: str, user_id: int = 1):
    """获取实时行情"""
    code = crawler.normalize_code(code)
    data = crawler.get_realtime(code)
    if not data:
        raise HTTPException(status_code=404, detail=f"未找到股票 {code}")
    return data

@app.get("/api/stock/analysis")
async def get_analysis(code: str):
    """获取综合分析"""
    code = crawler.normalize_code(code)
    data = crawler.get_realtime(code)
    if not data:
        raise HTTPException(status_code=404, detail=f"未找到股票 {code}")

    report = analyzer.generate_report(data)
    return report

@app.get("/api/stock/batch")
async def get_batch(codes: str):
    """批量获取行情（逗号分隔）"""
    results = []
    errors = []
    for code in codes.split(','):
        code = code.strip()
        if not code:
            continue
        code = crawler.normalize_code(code)
        data = crawler.get_realtime(code)
        if data:
            results.append(data)
        else:
            errors.append(code)
    return {'results': results, 'errors': errors}

@app.get("/api/watchlist")
async def get_watchlist(user_id: int = None):
    """获取自选股列表"""
    if user_id is None:
        return {"error": "缺少用户ID"}
    user_id = int(user_id)
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM watchlist WHERE user_id = %s ORDER BY added_at DESC", (user_id,))
            items = cur.fetchall()

    # Batch fetch realtime data
    codes = [item['stock_code'] for item in items]
    stock_data = {}
    for code in codes:
        data = crawler.get_realtime(code)
        if data:
            stock_data[code] = data

    result = []
    for item in items:
        entry = {
            'id': item['id'],
            'code': item['stock_code'],
            'name': item['stock_name'] or stock_data.get(item['stock_code'], {}).get('name', ''),
            'added_at': item['added_at'].strftime('%Y-%m-%d %H:%M:%S') if item['added_at'] else ''
        }
        if item['stock_code'] in stock_data:
            entry.update({
                'current_price': stock_data[item['stock_code']].get('current_price'),
                'change_pct': stock_data[item['stock_code']].get('change_pct'),
                'volume': stock_data[item['stock_code']].get('volume'),
            })
        result.append(entry)
    return {'watchlist': result}

@app.post("/api/watchlist")
async def add_watchlist(body: WatchlistAdd, user_id: int = None):
    """添加自选股"""
    if user_id is None:
        return {"error": "缺少用户ID"}
    user_id = int(user_id)
    code = crawler.normalize_code(body.code)
    # Fetch name
    data = crawler.get_realtime(code)
    name = data.get('name', '') if data else ''

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO watchlist (user_id, stock_code, stock_name) VALUES (%s, %s, %s) "
                "ON DUPLICATE KEY UPDATE stock_name = VALUES(stock_name)",
                (user_id, code, name)
            )
        conn.commit()
    return {'success': True, 'code': code, 'name': name}

@app.delete("/api/watchlist")
async def remove_watchlist(code: str, user_id: int = None):
    """删除自选股"""
    if user_id is None:
        return {"error": "缺少用户ID"}
    user_id = int(user_id)
    code = crawler.normalize_code(code)
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM watchlist WHERE user_id = %s AND stock_code = %s", (user_id, code))
        conn.commit()
    return {'success': True}

@app.get("/api/stock/suggest")
async def get_suggestions():
    """热门推荐"""
    hot_stocks = [
        {'code': 'sh600519', 'name': '贵州茅台'},
        {'code': 'sz000858', 'name': '五粮液'},
        {'code': 'sh601318', 'name': '中国平安'},
        {'code': 'sz000001', 'name': '平安银行'},
        {'code': 'sh600036', 'name': '招商银行'},
        {'code': 'sz300750', 'name': '宁德时代'},
        {'code': 'sh601899', 'name': '紫金矿业'},
        {'code': 'sz002594', 'name': '比亚迪'},
        {'code': 'sh600900', 'name': '长江电力'},
        {'code': 'sz000725', 'name': '京东方A'},
    ]
    return {'suggest': hot_stocks}

@app.get("/api/stock/kline")
async def get_kline(code: str, klt: int = 101, count: int = 100):
    """获取K线数据
    klt: 101=日K, 102=周K, 104=月K
    count: 获取条数 (默认100)
    """
    code = crawler.normalize_code(code)
    klines = crawler.get_kline(code, klt=klt, count=count)
    if not klines:
        raise HTTPException(status_code=404, detail=f"未找到股票 {code} 的K线数据")
    return {'klines': klines, 'code': code}

@app.get("/api/market/indices")
async def get_market_indices():
    """获取主要市场指数走势"""
    indices = crawler.get_market_indices()
    return {'indices': indices}

@app.get("/api/market/sectors")
async def get_sector_heatmap():
    """获取行业板块涨跌幅"""
    sectors = crawler.get_sector_heatmap()
    return {'sectors': sectors}

@app.get("/api/market/sector/kline")
async def get_sector_kline(code: str, count: int = 20):
    """获取板块K线走势
    code: 板块代码 (如 BK0491)
    count: 获取条数 (默认20)
    """
    klines = crawler.get_sector_kline(code, count=count)
    if not klines:
        raise HTTPException(status_code=404, detail=f"未找到板块 {code} 的K线数据")
    return {'klines': klines, 'code': code}

@app.get("/health")
async def health():
    return {'status': 'ok', 'service': 'stock', 'timestamp': datetime.now().isoformat()}

# ============ Startup ============

@app.on_event("startup")
async def startup():
    ensure_tables()
    print("[Stock] Service started on :8091")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8091)
