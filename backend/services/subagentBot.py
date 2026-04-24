#!/usr/bin/env python3
"""
子代理机器人 - 使用 Hermes Agent AIAgent
通过 Flask/HTTP 接口供 Node.js 后端调用
"""

import sys
import os
import json
import logging
from flask import Flask, request, jsonify

# 添加 Hermes Agent 到路径
sys.path.insert(0, '/opt/hermes-agent')
os.chdir('/opt/hermes-agent')

# 设置环境变量（使用主模型）
os.environ['HERMES_MODEL'] = 'ep-qubph3-1775115536595397049'

from run_agent import AIAgent

app = Flask(__name__)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [SubagentBot] %(message)s'
)
logger = logging.getLogger(__name__)

# 全局 agent 实例（复用）
_agent = None

def get_agent():
    global _agent
    if _agent is None:
        _agent = AIAgent(
            model='ep-qubph3-1775115536595397049',
            max_iterations=10,
            enabled_toolsets=['terminal', 'file', 'web'],
            quiet_mode=True,
            skip_context_files=True,
            skip_memory=True,
            platform='api'
        )
        logger.info('AIAgent 已初始化，模型: ep-qubph3-1775115536595397049')
    return _agent

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})

@app.route('/respond', methods=['POST'])
def respond():
    """
    处理群聊消息并返回 AI 回复
    
    POST /respond
    Body: {
        "group_id": 123,
        "sender_id": 456,
        "sender_name": "用户名",
        "message": "消息内容"
    }
    """
    try:
        data = request.json
        sender_name = data.get('sender_name', '用户')
        message = data.get('message', '')
        
        if not message or len(message.strip()) < 2:
            return jsonify({'success': False, 'error': '消息太短'})
        
        # 构建提示词
        prompt = f"""你是群聊中的AI助手。用户 "{sender_name}" 说: "{message}"

请用友好、简洁的中文回复。如果用户请求执行命令或代码，请谨慎评估安全性。
回复不要超过200字。"""
        
        logger.info(f'收到消息: {sender_name}: {message[:50]}...')
        
        agent = get_agent()
        response = agent.chat(prompt)
        
        if response:
            logger.info(f'AI 回复: {response[:100]}...')
            return jsonify({
                'success': True,
                'result': response,
                'model': 'ep-agr16j-1776132426466498538'
            })
        else:
            logger.warning('AI 返回空响应')
            return jsonify({
                'success': True,
                'result': '👋 我收到你的消息了！'
            })
            
    except Exception as e:
        logger.error(f'处理消息失败: {e}', exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/chat', methods=['POST'])
def chat():
    """
    通用聊天接口
    
    POST /chat
    Body: {
        "prompt": "提示词",
        "model": "可选的模型覆盖"
    }
    """
    try:
        data = request.json
        prompt = data.get('prompt', '')
        
        if not prompt:
            return jsonify({'success': False, 'error': '缺少 prompt'}), 400
        
        agent = get_agent()
        response = agent.chat(prompt)
        
        return jsonify({
            'success': True,
            'result': response or '抱歉，我暂时无法回复。'
        })
        
    except Exception as e:
        logger.error(f'聊天失败: {e}', exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    logger.info('子代理机器人服务启动中...')
    app.run(host='127.0.0.1', port=8092, debug=False)
