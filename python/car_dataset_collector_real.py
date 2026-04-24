#!/usr/bin/env python3
"""
车辆图片数据收集脚本 - 真实数据版本
从公开 API 下载真实车辆图片
"""

import os
import sys
import json
import time
import random
import hashlib
import shutil
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime

# 车辆品牌和对应的 Unsplash 搜索关键词
CAR_BRANDS = {
    'mercedes': ['mercedes benz car', 'mercedes c-class', 'mercedes e-class'],
    'bmw': ['bmw car', 'bmw 3 series', 'bmw x5'],
    'audi': ['audi car', 'audi a4', 'audi q5'],
    'volkswagen': ['volkswagen car', 'vw golf', 'volkswagen passat'],
    'toyota': ['toyota car', 'toyota camry', 'toyota rav4'],
    'honda': ['honda car', 'honda civic', 'honda cr-v'],
    'nissan': ['nissan car', 'nissan altima', 'nissan rogue'],
    'ford': ['ford car', 'ford focus', 'ford f150'],
    'chevrolet': ['chevrolet car', 'chevy malibu', 'chevrolet silverado'],
    'buick': ['buick car', 'buick regal'],
    'hyundai': ['hyundai car', 'hyundai elantra', 'hyundai tucson'],
    'kia': ['kia car', 'kia optima', 'kia sportage'],
    'mazda': ['mazda car', 'mazda3', 'mazda cx5'],
    'lexus': ['lexus car', 'lexus es', 'lexus rx'],
    'porsche': ['porsche car', 'porsche 911', 'porsche cayenne'],
    'landrover': ['land rover', 'range rover', 'land rover discovery'],
    'jaguar': ['jaguar car', 'jaguar xe'],
    'volvo': ['volvo car', 'volvo s60', 'volvo xc90'],
    'cadillac': ['cadillac car', 'cadillac escalade'],
    'tesla': ['tesla car', 'tesla model 3', 'tesla model y'],
    'byd': ['byd car', 'byd han', 'byd tang'],
    'geely': ['geely car', 'geely emgrand'],
    'changan': ['changan car', 'changan cs75'],
    'haval': ['haval car', 'haval h6'],
    'nio': ['nio car', 'nio es6', 'nio es8'],
    'xpeng': ['xpeng car', 'xpeng p7'],
    'li': ['li auto', 'li one'],
}

# 使用 Pexels API（免费，无需 key 的替代方案）
# 这里使用 Picsum 和 Unsplash 的公开图片作为示例
def download_images_for_brand(brand, keywords, output_dir, max_images=50):
    """为某个品牌下载图片"""
    brand_dir = Path(output_dir) / brand
    brand_dir.mkdir(parents=True, exist_ok=True)
    
    downloaded = 0
    keyword = keywords[0]  # 使用第一个关键词
    
    # 使用 Lorem Flickr 下载真实车辆图片
    for i in range(max_images):
        try:
            # Lorem Flickr 提供真实的车辆图片
            url = f"https://loremflickr.com/320/240/{keyword.replace(' ', ',')}/all?lock={i}"
            local_path = brand_dir / f"{brand}_{i:04d}.jpg"
            
            # 设置 User-Agent 避免被屏蔽
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=30) as response:
                with open(local_path, 'wb') as f:
                    f.write(response.read())
            
            # 验证图片是否有效（检查文件大小）
            if local_path.stat().st_size > 1000:  # 至少 1KB
                downloaded += 1
                print(f"    ✓ {brand}: {downloaded}/{max_images}")
            else:
                local_path.unlink()
                
        except Exception as e:
            print(f"    ⚠ 下载失败: {e}")
            continue
            
        # 避免请求过快
        time.sleep(0.5)
        
    return downloaded


class RealCarDatasetCollector:
    def __init__(self, output_dir='car_dataset', images_per_brand=50):
        self.output_dir = Path(output_dir)
        self.images_per_brand = images_per_brand
        
    def run(self):
        """执行数据收集"""
        print("🚗 真实车辆数据集收集工具")
        print("=" * 60)
        
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        total_downloaded = 0
        failed_brands = []
        
        for brand, keywords in CAR_BRANDS.items():
            print(f"\n📥 下载 {brand} 的图片...")
            try:
                count = download_images_for_brand(
                    brand, keywords, 
                    self.output_dir,
                    self.images_per_brand
                )
                total_downloaded += count
                if count < 10:
                    failed_brands.append(brand)
                print(f"  ✅ {brand}: {count} 张")
            except Exception as e:
                print(f"  ❌ {brand}: 失败 - {e}")
                failed_brands.append(brand)
            
            # 每 5 个品牌休息一下
            if (total_downloaded % (self.images_per_brand * 5)) == 0:
                print("⏸️ 休息 5 秒...")
                time.sleep(5)
        
        # 生成元数据
        metadata = {
            'created_at': datetime.now().isoformat(),
            'total_brands': len(CAR_BRANDS),
            'images_per_brand': self.images_per_brand,
            'total_images': total_downloaded,
            'brands': list(CAR_BRANDS.keys()),
            'failed_brands': failed_brands,
            'dataset_version': '1.0-real',
        }
        
        # 统计每个品牌的实际图片数
        brand_counts = {}
        for brand_dir in self.output_dir.iterdir():
            if brand_dir.is_dir():
                count = len(list(brand_dir.glob('*.jpg')))
                brand_counts[brand_dir.name] = count
                
        metadata['brand_counts'] = brand_counts
        
        with open(self.output_dir / 'dataset_metadata.json', 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)
        
        print("\n" + "=" * 60)
        print(f"✅ 数据收集完成！")
        print(f"📊 总计: {total_downloaded} 张图片")
        print(f"📁 目录: {self.output_dir.absolute()}")
        print(f"⚠️  失败品牌: {', '.join(failed_brands) if failed_brands else '无'}")
        print("=" * 60)
        
        return total_downloaded


if __name__ == '__main__':
    collector = RealCarDatasetCollector(
        output_dir='car_dataset_real',
        images_per_brand=30  # 减少数量以加快测试
    )
    collector.run()
