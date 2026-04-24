#!/usr/bin/env python3
"""
模型转换和部署脚本
将训练好的模型转换为前端可用的格式（TensorFlow.js）
并集成到 PA 项目中
"""

import os
import sys
import json
import shutil
from pathlib import Path
from datetime import datetime

# 配置
CONFIG = {
    'model_output': 'car_model_output',
    'frontend_model_dir': '/opt/personalAssistant/frontend/src/models/car-recognition',
    'backend_model_dir': '/opt/personalAssistant/backend/models/car-recognition',
}

# 车辆品牌列表（必须与训练时一致）
BRANDS = [
    'mercedes', 'bmw', 'audi', 'volkswagen', 'toyota', 'honda', 'nissan',
    'ford', 'chevrolet', 'buick', 'hyundai', 'kia', 'mazda', 'lexus',
    'porsche', 'landrover', 'jaguar', 'volvo', 'cadillac', 'tesla',
    'byd', 'geely', 'changan', 'haval', 'nio', 'xpeng', 'li'
]

# 品牌详细信息（与前端 CarRecognitionView.vue 保持一致）
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


def convert_to_tensorflowjs():
    """将模型转换为 TensorFlow.js 格式"""
    print("🔄 转换模型为 TensorFlow.js 格式...")
    
    model_dir = Path(CONFIG['model_output'])
    
    # 检查是否有现成的模型
    if (model_dir / 'tfjs_model').exists():
        print("  ✅ TensorFlow.js 模型已存在")
        return True
    
    if (model_dir / 'car_recognition.h5').exists():
        print("  📦 从 Keras 模型转换...")
        try:
            import tensorflow as tf
            import tensorflowjs as tfjs
            
            model = tf.keras.models.load_model(model_dir / 'car_recognition.h5')
            tfjs.converters.save_keras_model(model, model_dir / 'tfjs_model')
            print("  ✅ 转换成功")
            return True
        except Exception as e:
            print(f"  ❌ 转换失败: {e}")
            return False
    
    if (model_dir / 'car_recognition.onnx').exists():
        print("  📦 从 ONNX 模型转换...")
        # 需要 onnx-tf 转换
        print("  ⚠️  需要安装 onnx-tf: pip install onnx-tf")
        return False
    
    print("  ⚠️  未找到可转换的模型文件")
    return False


def create_brand_mapping():
    """创建品牌映射文件（模型输出 → 品牌信息）"""
    print("\n📋 创建品牌映射文件...")
    
    mapping = {
        'version': '1.0',
        'created_at': datetime.now().isoformat(),
        'num_classes': len(BRANDS),
        'image_size': 224,
        'brands': {}
    }
    
    for i, brand in enumerate(BRANDS):
        info = BRAND_INFO.get(brand, {})
        mapping['brands'][str(i)] = {
            'id': brand,
            'name': info.get('name', brand),
            'icon': info.get('icon', '🚗'),
            'country': info.get('country', '未知'),
            'manufacturer': info.get('manufacturer', '未知'),
            'priceRange': info.get('priceRange', '未知'),
            'year': info.get('year', '未知'),
        }
    
    output_path = Path(CONFIG['model_output']) / 'brand_mapping.json'
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(mapping, f, indent=2, ensure_ascii=False)
    
    print(f"  ✅ 已创建 {len(BRANDS)} 个品牌映射")
    return mapping


def deploy_to_frontend():
    """部署模型到前端"""
    print("\n📦 部署模型到前端...")
    
    frontend_dir = Path(CONFIG['frontend_model_dir'])
    frontend_dir.mkdir(parents=True, exist_ok=True)
    
    # 复制模型文件
    tfjs_dir = Path(CONFIG['model_output']) / 'tfjs_model'
    if tfjs_dir.exists():
        # 复制所有模型文件
        for file in tfjs_dir.glob('*'):
            shutil.copy2(file, frontend_dir / file.name)
        print(f"  ✅ 模型文件已复制到: {frontend_dir}")
    else:
        print("  ⚠️  未找到 TensorFlow.js 模型，创建占位文件")
        # 创建占位文件
        placeholder = {
            'note': '模型文件将在训练完成后生成',
            'instructions': '运行 python train_car_recognition.py 进行训练'
        }
        with open(frontend_dir / 'placeholder.json', 'w', encoding='utf-8') as f:
            json.dump(placeholder, f, indent=2, ensure_ascii=False)
    
    # 复制品牌映射
    brand_mapping = Path(CONFIG['model_output']) / 'brand_mapping.json'
    if brand_mapping.exists():
        shutil.copy2(brand_mapping, frontend_dir / 'brand_mapping.json')
        print(f"  ✅ 品牌映射已复制")
    
    return True


def deploy_to_backend():
    """部署模型到后端（如果需要后端推理）"""
    print("\n📦 部署模型到后端...")
    
    backend_dir = Path(CONFIG['backend_model_dir'])
    backend_dir.mkdir(parents=True, exist_ok=True)
    
    # 复制模型文件
    tfjs_dir = Path(CONFIG['model_output']) / 'tfjs_model'
    if tfjs_dir.exists():
        for file in tfjs_dir.glob('*'):
            shutil.copy2(file, backend_dir / file.name)
        print(f"  ✅ 模型文件已复制到: {backend_dir}")
    
    # 复制品牌映射
    brand_mapping = Path(CONFIG['model_output']) / 'brand_mapping.json'
    if brand_mapping.exists():
        shutil.copy2(brand_mapping, backend_dir / 'brand_mapping.json')
    
    return True


def update_frontend_config():
    """更新前端配置以使用新模型"""
    print("\n⚙️  更新前端配置...")
    
    # 这里可以添加代码来更新前端的模型加载逻辑
    # 例如修改 CarRecognitionView.vue 中的模型路径
    
    print("  ℹ️  请手动更新 CarRecognitionView.vue 中的模型加载路径")
    print(f"  📁 新模型路径: {CONFIG['frontend_model_dir']}")
    
    return True


def cleanup():
    """清理临时文件"""
    print("\n🗑️  清理临时文件...")
    
    # 保留最终模型，删除中间文件
    temp_files = ['best_model.pth', 'car_recognition.onnx', 'car_recognition.h5']
    for temp_file in temp_files:
        path = Path(CONFIG['model_output']) / temp_file
        if path.exists():
            path.unlink()
            print(f"  ✓ 删除: {temp_file}")
    
    print("  ✅ 清理完成")
    return True


def main():
    """主部署流程"""
    print("🚗 车辆识别模型部署工具")
    print("=" * 60)
    print(f"📅 时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    # 1. 转换模型
    convert_to_tensorflowjs()
    
    # 2. 创建品牌映射
    create_brand_mapping()
    
    # 3. 部署到前端
    deploy_to_frontend()
    
    # 4. 部署到后端
    deploy_to_backend()
    
    # 5. 更新配置
    update_frontend_config()
    
    # 6. 清理
    cleanup()
    
    print("\n" + "=" * 60)
    print("✅ 部署完成！")
    print(f"📁 前端模型: {CONFIG['frontend_model_dir']}")
    print(f"📁 后端模型: {CONFIG['backend_model_dir']}")
    print("=" * 60)
    
    return True


if __name__ == '__main__':
    main()
