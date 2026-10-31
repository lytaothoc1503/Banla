#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Cross-Review Script for Google Antigravity
Tự động lấy git diff và gửi song song tới xAI Grok và OpenAI Codex/GPT
để thực hiện review mã nguồn chéo độc lập.
Không yêu cầu cài thêm thư viện ngoài (sử dụng chuẩn thư viện Python 3).
"""

import os
import sys
import json
import subprocess
import urllib.request
import urllib.error

def load_env():
    """Tự động đọc file .env nếu có ở thư mục hiện tại hoặc thư mục cha"""
    current = os.getcwd()
    while current:
        env_path = os.path.join(current, ".env")
        if os.path.isfile(env_path):
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            key, val = line.split("=", 1)
                            key = key.strip()
                            val = val.strip().strip('"').strip("'")
                            if key not in os.environ:
                                os.environ[key] = val
            except Exception:
                pass
            break
        parent = os.path.dirname(current)
        if parent == current:
            break
        current = parent

load_env()

XAI_API_KEY = os.getenv("XAI_API_KEY", "").strip()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()

def get_git_diff():
    """Lấy các thay đổi mã nguồn chưa commit từ git"""
    try:
        res = subprocess.run(["git", "diff", "HEAD"], capture_output=True, text=True, encoding="utf-8")
        diff = res.stdout.strip()
        if not diff:
            res_cached = subprocess.run(["git", "diff", "--cached"], capture_output=True, text=True, encoding="utf-8")
            diff = res_cached.stdout.strip()
        
        if not diff:
            res_status = subprocess.run(["git", "status", "--short"], capture_output=True, text=True, encoding="utf-8")
            status = res_status.stdout.strip()
            if status:
                return f"[Git Status - Các file mới/thay đổi]:\n{status}\n(Ghi chú: Hãy 'git add' các file mới để lấy diff chi tiết nhất)."
            return "Không có thay đổi mã nguồn nào trong thư mục git."
        
        if len(diff) > 25000:
            diff = diff[:25000] + "\n\n...[DIFF ĐÃ ĐƯỢC CẮT BỚT DO QUÁ DÀI]..."
        return diff
    except Exception as e:
        return f"[Lỗi lấy Git diff]: {e}"

def call_grok(diff_content):
    """Gửi diff tới xAI Grok để thẩm định bảo mật, edge cases và logic"""
    if not XAI_API_KEY:
        return "⚠️ Bỏ qua Grok: Chưa cấu hình XAI_API_KEY trong file .env hoặc biến môi trường."
    
    url = "https://api.x.ai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {XAI_API_KEY}",
        "Content-Type": "application/json",
        "User-Agent": "Antigravity-CrossReviewer/1.0"
    }
    sys_prompt = (
        "Bạn là chuyên gia thẩm định bảo mật và phản biện hệ thống độc lập. "
        "Hãy phân tích kỹ đoạn git diff sau đây. Hãy đưa ra nhận xét ngắn gọn, sắc bén gồm:\n"
        "1. Nguy cơ bảo mật tiềm ẩn (XSS, CSRF, Injection, rò rỉ dữ liệu, thiếu xác thực).\n"
        "2. Các trường hợp biên (edge cases) có thể gây crash hoặc nghẽn hiệu năng.\n"
        "3. Đánh giá tính hợp lý của kiến trúc và logic nghiệp vụ.\n"
        "Trình bày theo dạng danh sách gạch đầu dòng rõ ràng, hành động cụ thể."
    )
    payload = {
        "model": "grok-2-latest",
        "messages": [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": f"Vui lòng phản biện đoạn git diff sau:\n\n```diff\n{diff_content}\n```"}
        ],
        "temperature": 0.2
    }
    try:
        req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers)
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data["choices"][0]["message"]["content"]
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8", errors="ignore")
        return f"⚠️ Lỗi HTTP từ xAI Grok ({e.code}): {err_msg}"
    except Exception as e:
        return f"⚠️ Lỗi kết nối Grok: {e}"

def call_codex(diff_content):
    """Gửi diff tới OpenAI (Codex / GPT-4o) để kiểm tra chuẩn cú pháp, Clean Code và Test Cases"""
    if not OPENAI_API_KEY:
        return "⚠️ Bỏ qua Codex: Chưa cấu hình OPENAI_API_KEY trong file .env hoặc biến môi trường."
    
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
        "User-Agent": "Antigravity-CrossReviewer/1.0"
    }
    sys_prompt = (
        "Bạn là chuyên gia QA, Clean Code và kiểm chuẩn phần mềm. "
        "Hãy phân tích đoạn git diff sau đây và đưa ra nhận xét gồm:\n"
        "1. Chuẩn cú pháp, Type Safety và quy ước đặt tên (naming conventions).\n"
        "2. Tối ưu hóa code (Clean Code, DRY, loại bỏ code thừa/lặp lại).\n"
        "3. Các kịch bản kiểm thử (Unit / Integration Tests) bắt buộc phải bổ sung.\n"
        "Trình bày súc tích, chỉ rõ vị trí và cách sửa cụ thể."
    )
    payload = {
        "model": "gpt-4o",
        "messages": [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": f"Vui lòng rà soát mã nguồn git diff sau:\n\n```diff\n{diff_content}\n```"}
        ],
        "temperature": 0.2
    }
    try:
        req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers)
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data["choices"][0]["message"]["content"]
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8", errors="ignore")
        return f"⚠️ Lỗi HTTP từ OpenAI ({e.code}): {err_msg}"
    except Exception as e:
        return f"⚠️ Lỗi kết nối OpenAI: {e}"

def main():
    print("=" * 60)
    print("🔍 [ANTIGRAVITY CROSS-REVIEWER]: BẮT ĐẦU THẨM ĐỊNH MÃ NGUỒN")
    print("=" * 60 + "\n")
    
    diff = get_git_diff()
    if diff == "Không có thay đổi mã nguồn nào trong thư mục git.":
        print("ℹ️ " + diff)
        sys.exit(0)
    
    print(">>> 1. Đang gửi diff tới xAI Grok (Bảo mật & Phản biện Logic)...")
    grok_review = call_grok(diff)
    
    print(">>> 2. Đang gửi diff tới OpenAI Codex/GPT-4o (Clean Code & Test Cases)...\n")
    codex_review = call_codex(diff)
    
    print("=" * 60)
    print("🛡️ KẾT QUẢ THẨM ĐỊNH TỪ XAI GROK")
    print("=" * 60)
    print(grok_review)
    print("\n" + "=" * 60)
    print("⚡ KẾT QUẢ THẨM ĐỊNH TỪ OPENAI CODEX / QA")
    print("=" * 60)
    print(codex_review)
    print("\n" + "=" * 60)
    print("✅ HOÀN THÀNH QUY TRÌNH REVIEW CHÉO ĐỘC LẬP")
    print("=" * 60)

if __name__ == "__main__":
    main()
