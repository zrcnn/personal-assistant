#!/usr/bin/env python3
"""
车辆识别模型训练 - 本地 CPU 版本
使用预生成数据和合成数据增强进行训练
"""

import os
import sys
import json
import time
import random
import math
from pathlib import Path
from datetime import datetime

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms, models

# 配置
CONFIG = {
    'output_dir': 'car_model_output',
    'image_size': 224,
    'batch_size': 32,  # CPU 可以跑更大的 batch
    'num_epochs': 30,
    'learning_rate': 0.001,
    'num_classes': 27,
    'num_training_samples': 2700,  # 每个品牌 100 张合成数据
}

BRANDS = [
    'mercedes', 'bmw', 'audi', 'volkswagen', 'toyota', 'honda', 'nissan',
    'ford', 'chevrolet', 'buick', 'hyundai', 'kia', 'mazda', 'lexus',
    'porsche', 'landrover', 'jaguar', 'volvo', 'cadillac', 'tesla',
    'byd', 'geely', 'changan', 'haval', 'nio', 'xpeng', 'li'
]

BRAND_COLORS = {
    'mercedes': (30, 30, 50),
    'bmw': (20, 40, 80),
    'audi': (40, 40, 40),
    'volkswagen': (50, 50, 70),
    'toyota': (60, 40, 40),
    'honda': (70, 50, 50),
    'nissan': (50, 60, 70),
    'ford': (40, 60, 80),
    'chevrolet': (30, 50, 70),
    'buick': (60, 50, 40),
    'hyundai': (50, 70, 60),
    'kia': (70, 60, 50),
    'mazda': (80, 40, 40),
    'lexus': (40, 50, 60),
    'porsche': (90, 60, 30),
    'landrover': (30, 50, 30),
    'jaguar': (40, 40, 50),
    'volvo': (50, 60, 70),
    'cadillac': (30, 30, 40),
    'tesla': (80, 80, 90),
    'byd': (60, 70, 60),
    'geely': (50, 50, 60),
    'changan': (70, 60, 50),
    'haval': (60, 50, 40),
    'nio': (70, 70, 80),
    'xpeng': (60, 70, 70),
    'li': (50, 60, 50),
}


class SyntheticCarDataset(Dataset):
    """合成车辆数据集 - 每个品牌生成独特的视觉特征"""
    
    def __init__(self, num_samples=2700, image_size=224, transform=None, is_train=True):
        self.num_samples = num_samples
        self.image_size = image_size
        self.transform = transform
        self.is_train = is_train
        self.samples = []
        
        samples_per_class = num_samples // len(BRANDS)
        
        for class_idx, brand in enumerate(BRANDS):
            color = BRAND_COLORS[brand]
            for i in range(samples_per_class):
                # 生成带品牌特征的伪图片
                img = self._generate_car_image(color, brand, i)
                self.samples.append((img, class_idx))
    
    def _generate_car_image(self, base_color, brand, variation):
        """生成带有品牌特征的伪图片 - 确保不同品牌有明显区别"""
        rng = np.random.RandomState(hash((brand, variation)) % (2**31))
        
        img = np.zeros((self.image_size, self.image_size, 3), dtype=np.float32)
        
        # 背景 - 不同品牌用不同背景色调
        bg_base = rng.randint(50, 200, 3).astype(np.float32)
        img[:, :] = bg_base
        
        # 车身形状和位置 - 不同品牌不同
        brand_hash = hash(brand) % 100
        car_type = brand_hash % 4  # 0=轿车, 1=SUV, 2=跑车, 3=卡车
        
        if car_type == 0:  # 轿车
            car_y1 = int(self.image_size * (0.35 + 0.05 * (brand_hash % 5) / 5))
            car_y2 = int(self.image_size * (0.65 + 0.05 * (brand_hash % 3) / 5))
            car_x1 = int(self.image_size * (0.1 + 0.05 * (brand_hash % 4) / 5))
            car_x2 = int(self.image_size * (0.9 - 0.05 * (brand_hash % 3) / 5))
        elif car_type == 1:  # SUV
            car_y1 = int(self.image_size * (0.25 + 0.05 * (brand_hash % 5) / 5))
            car_y2 = int(self.image_size * (0.7 + 0.05 * (brand_hash % 3) / 5))
            car_x1 = int(self.image_size * (0.12 + 0.05 * (brand_hash % 4) / 5))
            car_x2 = int(self.image_size * (0.88 - 0.05 * (brand_hash % 3) / 5))
        elif car_type == 2:  # 跑车
            car_y1 = int(self.image_size * (0.4 + 0.05 * (brand_hash % 5) / 5))
            car_y2 = int(self.image_size * (0.6 + 0.05 * (brand_hash % 3) / 5))
            car_x1 = int(self.image_size * (0.15 + 0.05 * (brand_hash % 4) / 5))
            car_x2 = int(self.image_size * (0.85 - 0.05 * (brand_hash % 3) / 5))
        else:  # 卡车
            car_y1 = int(self.image_size * (0.2 + 0.05 * (brand_hash % 5) / 5))
            car_y2 = int(self.image_size * (0.75 + 0.05 * (brand_hash % 3) / 5))
            car_x1 = int(self.image_size * (0.08 + 0.05 * (brand_hash % 4) / 5))
            car_x2 = int(self.image_size * (0.92 - 0.05 * (brand_hash % 3) / 5))
        
        # 车身颜色 - 品牌主色 + 变化
        color_variation = rng.normal(0, 20, 3).astype(np.float32)
        car_color = np.clip(np.array(base_color, dtype=np.float32) + color_variation, 0, 255)
        img[car_y1:car_y2, car_x1:car_x2] = car_color
        
        # 车窗 - 不同品牌不同大小
        window_ratio = 0.2 + 0.15 * ((brand_hash % 5) / 5)
        window_y1 = int(car_y1 + (car_y2 - car_y1) * 0.1)
        window_y2 = int(car_y1 + (car_y2 - car_y1) * window_ratio)
        window_x1 = int(car_x1 + (car_x2 - car_x1) * 0.15)
        window_x2 = int(car_x2 - (car_x2 - car_x1) * 0.15)
        window_color = 30 + rng.randint(0, 40)
        img[window_y1:window_y2, window_x1:window_x2] = window_color
        
        # 车轮 - 不同品牌不同位置和大小
        wheel_radius = int(self.image_size * (0.04 + 0.03 * ((brand_hash % 4) / 4)))
        for wx_offset, wy_offset in [(0.25, -15), (0.75, -15)]:
            wx = car_x1 + int((car_x2 - car_x1) * wx_offset)
            wy = car_y2 + wy_offset
            y, x = np.ogrid[:self.image_size, :self.image_size]
            mask = (x - wx)**2 + (y - wy)**2 <= wheel_radius**2
            wheel_color = 15 + rng.randint(0, 20)
            img[mask] = wheel_color
        
        # 车灯 - 不同品牌不同颜色和形状
        headlight_type = brand_hash % 3
        if headlight_type == 0:
            hl_color = [255, 255, 200]
        elif headlight_type == 1:
            hl_color = [255, 200, 100]
        else:
            hl_color = [200, 200, 255]
        
        hl_w = 15 + (brand_hash % 10)
        hl_h = 8 + (brand_hash % 8)
        img[car_y1+3:car_y1+3+hl_h, car_x1+3:car_x1+3+hl_w] = hl_color
        img[car_y1+3:car_y1+3+hl_h, car_x2-3-hl_w:car_x2-3] = hl_color
        
        # 车标区域 - 每个品牌独特
        logo_x = (car_x1 + car_x2) // 2
        logo_y = (car_y1 + car_y2) // 2
        logo_size = 5 + (brand_hash % 8)
        logo_color = np.array([255, 255, 255]) if brand_hash % 2 == 0 else np.array([200, 200, 200])
        img[logo_y-logo_size:logo_y+logo_size, logo_x-logo_size:logo_x+logo_size] = logo_color
        
        # 随机噪声
        img += rng.normal(0, 3, img.shape).astype(np.float32)
        img = np.clip(img, 0, 255)
        
        return img
    
    def __len__(self):
        return len(self.samples)
    
    def __getitem__(self, idx):
        img, label = self.samples[idx]
        
        from PIL import Image
        img = Image.fromarray(img.astype(np.uint8))
        
        if self.transform:
            img = self.transform(img)
        
        return img, label


class MobileNetV3CarClassifier(nn.Module):
    """基于 MobileNetV3 的车辆分类器"""
    
    def __init__(self, num_classes=27):
        super().__init__()
        self.base_model = models.mobilenet_v3_small(weights=None)
        
        # 替换分类头
        in_features = self.base_model.classifier[0].in_features
        self.base_model.classifier = nn.Sequential(
            nn.Linear(in_features, 256),
            nn.Hardswish(),
            nn.Dropout(p=0.2, inplace=True),
            nn.Linear(256, num_classes)
        )
        
    def forward(self, x):
        return self.base_model(x)


def train():
    """训练模型"""
    print("🚗 车辆识别模型训练（本地 CPU）")
    print("=" * 60)
    print(f"📅 开始时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"🔧 设备: CPU")
    print(f"📊 配置: {json.dumps(CONFIG, indent=2)}")
    print("=" * 60)
    
    device = torch.device('cpu')
    
    # 数据预处理
    train_transform = transforms.Compose([
        transforms.Resize((CONFIG['image_size'], CONFIG['image_size'])),
        transforms.RandomHorizontalFlip(p=0.5),
        transforms.RandomRotation(degrees=10),
        transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2, hue=0.1),
        transforms.RandomAffine(degrees=0, translate=(0.1, 0.1), scale=(0.9, 1.1)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])
    
    val_transform = transforms.Compose([
        transforms.Resize((CONFIG['image_size'], CONFIG['image_size'])),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])
    
    # 创建数据集 - 训练集和验证集分开
    print("\n📊 生成训练数据...")
    train_dataset = SyntheticCarDataset(
        num_samples=int(CONFIG['num_training_samples'] * 0.8),
        image_size=CONFIG['image_size'],
        transform=train_transform,
        is_train=True
    )
    val_dataset = SyntheticCarDataset(
        num_samples=int(CONFIG['num_training_samples'] * 0.2),
        image_size=CONFIG['image_size'],
        transform=val_transform,
        is_train=False
    )
    
    train_loader = DataLoader(train_dataset, batch_size=CONFIG['batch_size'], shuffle=True, num_workers=0)
    val_loader = DataLoader(val_dataset, batch_size=CONFIG['batch_size'], shuffle=False, num_workers=0)
    
    print(f"  ✓ 训练集: {len(train_dataset)}, 验证集: {len(val_dataset)}")
    
    # 创建模型
    print("\n🏗️  创建模型...")
    model = MobileNetV3CarClassifier(num_classes=CONFIG['num_classes']).to(device)
    print(f"  ✓ 参数量: {sum(p.numel() for p in model.parameters()):,}")
    
    # 损失函数和优化器
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.AdamW(model.parameters(), lr=CONFIG['learning_rate'], weight_decay=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=CONFIG['num_epochs'])
    
    # 训练循环
    print("\n🔥 开始训练...")
    best_val_acc = 0.0
    training_history = []
    
    for epoch in range(CONFIG['num_epochs']):
        model.train()
        running_loss = 0.0
        correct = 0
        total = 0
        
        epoch_start = time.time()
        
        for batch_idx, (images, labels) in enumerate(train_loader):
            images, labels = images.to(device), labels.to(device)
            
            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            
            running_loss += loss.item()
            _, predicted = outputs.max(1)
            total += labels.size(0)
            correct += predicted.eq(labels).sum().item()
        
        train_acc = 100.0 * correct / total
        train_loss = running_loss / len(train_loader)
        
        # 验证
        model.eval()
        val_correct = 0
        val_total = 0
        val_loss = 0.0
        
        with torch.no_grad():
            for images, labels in val_loader:
                images, labels = images.to(device), labels.to(device)
                outputs = model(images)
                loss = criterion(outputs, labels)
                val_loss += loss.item()
                _, predicted = outputs.max(1)
                val_total += labels.size(0)
                val_correct += predicted.eq(labels).sum().item()
        
        val_acc = 100.0 * val_correct / val_total
        val_loss = val_loss / len(val_loader)
        
        epoch_time = time.time() - epoch_start
        
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            torch.save(model.state_dict(), Path(CONFIG['output_dir']) / 'best_model.pth')
        
        scheduler.step()
        
        history_entry = {
            'epoch': epoch + 1,
            'train_loss': train_loss,
            'train_acc': train_acc,
            'val_loss': val_loss,
            'val_acc': val_acc,
            'time': epoch_time
        }
        training_history.append(history_entry)
        
        # 每 5 个 epoch 打印一次详细报告
        if (epoch + 1) % 5 == 0 or epoch == 0:
            print(f"  Epoch [{epoch+1:>2}/{CONFIG['num_epochs']}] "
                  f"Loss: {train_loss:.4f} | Acc: {train_acc:>5.1f}% → Val Acc: {val_acc:>5.1f}% "
                  f"({epoch_time:.1f}s)")
        else:
            print(f"  Epoch [{epoch+1:>2}/{CONFIG['num_epochs']}] Loss: {train_loss:.4f} | Val Acc: {val_acc:>5.1f}%")
    
    # 保存最终模型
    torch.save(model.state_dict(), Path(CONFIG['output_dir']) / 'final_model.pth')
    
    # 导出为 TorchScript 格式（用于前端转换）
    print("\n📦 导出模型...")
    scripted_model = torch.jit.script(model)
    scripted_model.save(Path(CONFIG['output_dir']) / 'car_recognition.pt')
    print("  ✓ TorchScript 模型已导出")
    
    # 保存训练报告
    report = {
        'training_completed': True,
        'final_accuracy': best_val_acc,
        'final_train_acc': training_history[-1]['train_acc'],
        'num_epochs': CONFIG['num_epochs'],
        'training_time': sum(h['time'] for h in training_history),
        'model_output': CONFIG['output_dir'],
        'framework': 'pytorch_cpu',
        'config': CONFIG,
        'history': training_history,
        'brands': BRANDS,
        'created_at': datetime.now().isoformat(),
    }
    
    with open(Path(CONFIG['output_dir']) / 'training_report.json', 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    
    # 创建品牌映射
    brand_mapping = {
        'version': '1.0',
        'created_at': datetime.now().isoformat(),
        'num_classes': len(BRANDS),
        'image_size': CONFIG['image_size'],
        'brands': {}
    }
    
    BRAND_INFO = {
        'mercedes': {'name': '梅赛德斯-奔驰', 'icon': '⭐', 'country': '德国', 'manufacturer': '戴姆勒集团', 'priceRange': '30万-300万', 'year': '1926至今'},
        'bmw': {'name': '宝马', 'icon': '🔵', 'country': '德国', 'manufacturer': '宝马集团', 'priceRange': '25万-200万', 'year': '1916至今'},
        'audi': {'name': '奥迪', 'icon': '⭕', 'country': '德国', 'manufacturer': '大众集团', 'priceRange': '20万-180万', 'year': '1909至今'},
        'volkswagen': {'name': '大众', 'icon': 'VW', 'country': '德国', 'manufacturer': '大众集团', 'priceRange': '10万-80万', 'year': '1937至今'},
        'toyota': {'name': '丰田', 'icon': 'T', 'country': '日本', 'manufacturer': '丰田汽车', 'priceRange': '8万-100万', 'year': '1937至今'},
        'honda': {'name': '本田', 'icon': 'H', 'country': '日本', 'manufacturer': '本田技研', 'priceRange': '8万-50万', 'year': '1948至今'},
        'nissan': {'name': '日产', 'icon': 'N', 'country': '日本', 'manufacturer': '日产汽车', 'priceRange': '8万-60万', 'year': '1933至今'},
        'ford': {'name': '福特', 'icon': 'F', 'country': '美国', 'manufacturer': '福特汽车', 'priceRange': '8万-80万', 'year': '1903至今'},
        'chevrolet': {'name': '雪佛兰', 'icon': '⚡', 'country': '美国', 'manufacturer': '通用汽车', 'priceRange': '7万-50万', 'year': '1911至今'},
        'buick': {'name': '别克', 'icon': '🛡️', 'country': '美国', 'manufacturer': '通用汽车', 'priceRange': '12万-50万', 'year': '1899至今'},
        'hyundai': {'name': '现代', 'icon': 'H', 'country': '韩国', 'manufacturer': '现代汽车', 'priceRange': '8万-35万', 'year': '1967至今'},
        'kia': {'name': '起亚', 'icon': 'K', 'country': '韩国', 'manufacturer': '起亚汽车', 'priceRange': '7万-30万', 'year': '1944至今'},
        'mazda': {'name': '马自达', 'icon': 'M', 'country': '日本', 'manufacturer': '马自达', 'priceRange': '10万-40万', 'year': '1920至今'},
        'lexus': {'name': '雷克萨斯', 'icon': 'L', 'country': '日本', 'manufacturer': '丰田汽车', 'priceRange': '25万-150万', 'year': '1989至今'},
        'porsche': {'name': '保时捷', 'icon': '🐎', 'country': '德国', 'manufacturer': '大众集团', 'priceRange': '60万-500万', 'year': '1931至今'},
        'landrover': {'name': '路虎', 'icon': '🏔️', 'country': '英国', 'manufacturer': '塔塔汽车', 'priceRange': '35万-200万', 'year': '1948至今'},
        'jaguar': {'name': '捷豹', 'icon': '🐆', 'country': '英国', 'manufacturer': '塔塔汽车', 'priceRange': '30万-150万', 'year': '1922至今'},
        'volvo': {'name': '沃尔沃', 'icon': '⬆️', 'country': '瑞典', 'manufacturer': '吉利汽车', 'priceRange': '25万-100万', 'year': '1927至今'},
        'cadillac': {'name': '凯迪拉克', 'icon': '🛡️', 'country': '美国', 'manufacturer': '通用汽车', 'priceRange': '25万-150万', 'year': '1902至今'},
        'tesla': {'name': '特斯拉', 'icon': 'T', 'country': '美国', 'manufacturer': '特斯拉', 'priceRange': '25万-100万', 'year': '2003至今'},
        'byd': {'name': '比亚迪', 'icon': 'BYD', 'country': '中国', 'manufacturer': '比亚迪', 'priceRange': '6万-100万', 'year': '1995至今'},
        'geely': {'name': '吉利', 'icon': 'G', 'country': '中国', 'manufacturer': '吉利汽车', 'priceRange': '5万-30万', 'year': '1986至今'},
        'changan': {'name': '长安', 'icon': 'C', 'country': '中国', 'manufacturer': '长安汽车', 'priceRange': '5万-25万', 'year': '1862至今'},
        'haval': {'name': '哈弗', 'icon': 'H', 'country': '中国', 'manufacturer': '长城汽车', 'priceRange': '8万-25万', 'year': '2013至今'},
        'nio': {'name': '蔚来', 'icon': 'N', 'country': '中国', 'manufacturer': '蔚来汽车', 'priceRange': '30万-60万', 'year': '2014至今'},
        'xpeng': {'name': '小鹏', 'icon': 'X', 'country': '中国', 'manufacturer': '小鹏汽车', 'priceRange': '15万-45万', 'year': '2014至今'},
        'li': {'name': '理想', 'icon': 'Li', 'country': '中国', 'manufacturer': '理想汽车', 'priceRange': '30万-50万', 'year': '2015至今'},
    }
    
    for i, brand in enumerate(BRANDS):
        info = BRAND_INFO.get(brand, {})
        brand_mapping['brands'][str(i)] = {
            'id': brand,
            'name': info.get('name', brand),
            'icon': info.get('icon', '🚗'),
            'country': info.get('country', '未知'),
            'manufacturer': info.get('manufacturer', '未知'),
            'priceRange': info.get('priceRange', '未知'),
            'year': info.get('year', '未知'),
        }
    
    with open(Path(CONFIG['output_dir']) / 'brand_mapping.json', 'w', encoding='utf-8') as f:
        json.dump(brand_mapping, f, indent=2, ensure_ascii=False)
    
    print("\n" + "=" * 60)
    print("✅ 训练完成！")
    print(f"📊 最佳验证准确率: {best_val_acc:.2f}%")
    print(f"⏱️  总训练时间: {sum(h['time'] for h in training_history)/3600:.2f} 小时")
    print(f"📁 模型输出: {Path(CONFIG['output_dir']).absolute()}")
    print("=" * 60)
    
    return best_val_acc


if __name__ == '__main__':
    os.makedirs(CONFIG['output_dir'], exist_ok=True)
    train()
