#!/usr/bin/env python3
"""
子代理执行脚本 - 使用 Hermes Agent API 直接执行任务
使用备用模型 ep-agr16j-1776132426466498538
"""

import argparse
import json
import sys
import os

# 添加项目路径
sys.path.insert(0, '/opt/personalAssistant')

def run_subagent(model: str, prompt: str, timeout: int):
    """
    使用 Hermes Agent 执行子代理任务
    """
    try:
        # 尝试导入 Hermes Agent
        from run_agent import AIAgent
        
        agent = AIAgent(
            model=model,
            max_iterations=30,
            enabled_toolsets=['terminal', 'file', 'web'],
            quiet_mode=True,
            skip_context_files=True,
            skip_memory=True
        )
        
        result = agent.chat(prompt)
        
        output = {
            "success": True,
            "result": result,
            "model": model
        }
        
        print(json.dumps(output, ensure_ascii=False))
        return 0
        
    except ImportError:
        # Hermes Agent 不可用，使用 openclaw 作为后备
        import subprocess
        
        cmd = [
            'openclaw', 'agent', '--local', '--json',
            '--session-id', f'subagent-{os.getpid()}',
            '-m', prompt
        ]
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout
        )
        
        if result.returncode == 0:
            try:
                output = json.loads(result.stdout)
                print(json.dumps(output, ensure_ascii=False))
                return 0
            except json.JSONDecodeError:
                print(json.dumps({"success": True, "result": result.stdout}, ensure_ascii=False))
                return 0
        else:
            print(json.dumps({"success": False, "error": result.stderr}), file=sys.stderr)
            return result.returncode
            
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}), file=sys.stderr)
        return 1


def main():
    parser = argparse.ArgumentParser(description='子代理执行脚本')
    parser.add_argument('--model', required=True, help='模型ID')
    parser.add_argument('--prompt', required=True, help='提示词')
    parser.add_argument('--timeout', type=int, default=60000, help='超时时间(毫秒)')
    
    args = parser.parse_args()
    
    sys.exit(run_subagent(args.model, args.prompt, args.timeout))


if __name__ == '__main__':
    main()
