-- =============================================================================
-- ⛔ FILE CŨ (v1) ĐÃ BỊ VÔ HIỆU HÓA AN TOÀN (Xem docs/database_audit.md: D2, D3, D12)
-- Không còn chứa policy mở toang RLS hay dữ liệu mẫu giả (BL9821, BL7342).
-- Hãy sử dụng file chuẩn Production duy nhất (cách ly 100% trong schema `banla`):
--     supabase/sql/banla_production_master.sql
-- =============================================================================

do $$
begin
  raise exception '⛔ DỪNG LẠI: supabase_schema.sql (v1) đã ngừng sử dụng. Vui lòng mở và chạy file: supabase/sql/banla_production_master.sql';
end $$;
