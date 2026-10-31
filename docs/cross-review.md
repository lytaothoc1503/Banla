# Bộ Thiết Lập Tự Động Review Code Chéo cho Google Antigravity
*(Kết hợp Google Antigravity + xAI Grok + OpenAI Codex)*

Gói này cung cấp giải pháp tích hợp sẵn giúp **Google Antigravity** tự động triệu hồi **Grok** và **Codex** để thẩm định chéo các đoạn code mới viết trước khi commit hoặc merge.

---

## 📁 Cấu trúc thư mục

```text
your-project/
├── .agents/
│   ├── agents/
│   │   └── cross-reviewer.md    # Subagent định nghĩa trong Antigravity
│   └── scripts/
│       └── cross_review.py      # Script Python gọi song song API Grok & Codex
├── .env.example                 # Mẫu cấu hình API key
└── README.md
```

---

## 🚀 Hướng dẫn cài đặt vào dự án (3 bước)

### Bước 1: Giải nén vào thư mục dự án
1. Tải và giải nén tệp `antigravity_cross_review.zip`.
2. Sao chép thư mục `.agents/` và file `.env.example` vào thư mục gốc dự án website của bạn.

### Bước 2: Cấu hình API Key
1. Tạo một bản sao của file `.env.example` và đổi tên thành `.env`.
2. Mở file `.env` và điền API key của bạn:
   ```env
   XAI_API_KEY="xai-xxxxxxxxxxxxxxxxxxxx"
   OPENAI_API_KEY="sk-xxxxxxxxxxxxxxxxxxxx"
   ```
3. Đảm bảo file `.gitignore` của bạn đã có dòng `.env` để bảo mật key.

### Bước 3: Sử dụng trong Google Antigravity
Mở dự án trong **Antigravity App**, **Antigravity IDE** hoặc **Antigravity CLI (`agy`)**.

Khi giao việc lập trình cho Agent (Gemini 4 Argon), bạn chỉ cần gõ lời nhắc (prompt):

> *"Hãy viết component thanh toán cho website. Sau khi code xong, hãy gọi subagent `@cross-reviewer` để lấy đánh giá từ Grok và Codex, rồi tự động sửa toàn bộ các lỗi được chỉ ra trước khi hoàn thành."*

---

## ⚙️ Cơ chế hoạt động
1. **Antigravity (Gemini 4 Argon)** viết code vào các file trong repo.
2. Tự động kích hoạt subagent `@cross-reviewer` chạy script `cross_review.py`.
3. Script tự động lấy `git diff` chưa commit và gửi tới:
   - **xAI Grok**: Soi lỗ hổng bảo mật (XSS, Injection, Auth) và lỗi logic nghiệp vụ.
   - **OpenAI Codex/GPT-4o**: Kiểm tra chuẩn cú pháp, Clean Code, Type Safety và Test Cases.
4. Kết quả phản biện được nạp lại vào Antigravity để Gemini 4 Argon tự động refactor và hoàn thiện sản phẩm.
