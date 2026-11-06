# Khuôn mẫu (Template) định nghĩa Skill cho Dự án Banla

```markdown
---
name: <skill_name>
description: <Mô tả ngắn gọn mục đích của skill và khi nào được kích hoạt>
owner_agent: <Orchestrator | Backend | Web | App | QA>
permissions: <read-only | write-scoped>
risk_level: <low | medium | high>
status: planned
---

# Tên Skill: `<skill_name>`

## 1. Mục đích
...

## 2. Phạm vi & Quyền hạn (Allowed Directories)
- Đọc: ...
- Ghi: ...
- Cấm: ...

## 3. Đầu vào (Input)
...

## 4. Đầu ra (Output)
...

## 5. Quy trình Thực thi & Kiểm tra An toàn
1. Kiểm tra `TASK-ID` và khóa file (`Locked Files`).
2. Đọc bản mới nhất của file mục tiêu.
3. Tạo bản sao lưu (`create_backup`) nếu có ghi file quan trọng.
4. Xuất báo cáo kết quả.
```

