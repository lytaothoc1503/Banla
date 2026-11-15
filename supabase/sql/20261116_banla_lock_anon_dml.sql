-- =============================================================================
-- BANLA — Khóa anon đọc / sửa / xóa đơn và giao dịch (vá lỗi rà soát 16/11/2026, mục 1)
-- =============================================================================
-- FILE NÀY KHÔNG TỰ CHẠY. Anh Lý Tào Thóc chạy tay trong Supabase SQL Editor.
--
-- Chạy file nào: supabase/sql/20261116_banla_lock_anon_dml.sql
-- Project: Supabase của Banla (ref bắt đầu bằng hcik). Không đụng schema của
-- Mercure, Nhà của An (webmoi) hay Velora.
--
-- Việc file làm (idempotent, không xóa dòng, không đổi cột, không chuyển schema v2):
--   • Bật RLS + FORCE RLS trên banla.bookings và banla.transactions nếu bảng đã có.
--   • Gỡ mọi policy đang mở trên hai bảng đó.
--   • REVOKE SELECT, UPDATE, DELETE của anon và authenticated.
--   • Gỡ luôn quyền ghi giao dịch của anon (trang khách không ghi bảng transactions).
--   • Bảng v1: anon chỉ còn INSERT đơn khi payment_status/booking_status = pending,
--     paid_amount = 0 và smartlock_pin IS NULL.
--   • Bảng v2 (có cột amount_due): không thêm policy INSERT trực tiếp.
--   • Thu EXECUTE của anon/authenticated/PUBLIC trên hàm SECURITY DEFINER
--     banla_list_bookings, banla_approve_booking, banla_update_booking
--     (các hàm này vượt RLS). Giữ banla_create_booking.
--   • service_role giữ quyền đọc/ghi để Edge Function sau này dùng.
--
-- Nếu chưa có bảng banla.* : file chỉ báo NOTICE và không đổi gì.
--
-- HẬU QUẢ VỚI ADMIN HIỆN TẠI (admin.html):
--   Trang admin đang đọc, sửa, duyệt đơn bằng anon key (update/insert trực tiếp
--   và RPC banla_approve_booking). SAU KHI CHẠY FILE NÀY, các thao tác Supabase
--   đó trả lỗi quyền. Danh sách trên chính trình duyệt (localStorage) và API
--   Express /api/admin/* (khi chạy server.js với ADMIN_KEY) không bị file này đụng.
--   Site tĩnh banlaboutiquedalat.com không khai báo BANLA_SUPABASE_URL nên
--   form đặt phòng không gọi Supabase; file này không làm trang khách trắng.
--   Chưa chuyển admin.html sang schema v2 / Edge Function — đó là việc riêng.
--   Đừng chạy banla_schema_v2.sql đè lên bảng v1 (file v2 sẽ từ chối).
--
-- ĐỪNG chạy lại bản supabase_schema.sql đã copy ra ngoài trước 16/11/2026.
-- Bản trong repo đã khóa quyền anon; bản cũ nằm ngoài repo thì không chạy.
-- =============================================================================

begin;

do $lock$
declare
  pol record;
  fn record;
  role_name text;
  bookings_is_v2 boolean := false;
begin
  if to_regclass('banla.bookings') is null and to_regclass('banla.transactions') is null then
    raise notice 'Chưa có banla.bookings / banla.transactions. Không đổi dữ liệu.';
  end if;

  if to_regclass('banla.bookings') is not null then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'banla'
        and table_name = 'bookings'
        and column_name = 'amount_due'
    ) into bookings_is_v2;

    execute 'alter table banla.bookings enable row level security';
    execute 'alter table banla.bookings force row level security';
    execute 'revoke all on table banla.bookings from public';

    for role_name in select rolname from pg_roles where rolname in ('anon', 'authenticated') loop
      execute format('revoke all on table banla.bookings from %I', role_name);
    end loop;

    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute 'grant select, insert, update, delete on table banla.bookings to service_role';
    end if;

    for pol in
      select policyname from pg_policies
      where schemaname = 'banla' and tablename = 'bookings'
    loop
      execute format('drop policy if exists %I on banla.bookings', pol.policyname);
    end loop;

    if bookings_is_v2 then
      raise notice 'banla.bookings là schema v2. Đã thu quyền anon, không tạo policy INSERT trực tiếp.';
    elsif exists (select 1 from pg_roles where rolname = 'anon')
      and exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute 'grant insert on table banla.bookings to anon, authenticated';
      execute $policy$
        create policy banla_bookings_insert_pending_policy
          on banla.bookings
          for insert
          to anon, authenticated
          with check (
            payment_status = 'pending'
            and booking_status = 'pending'
            and paid_amount = 0
            and smartlock_pin is null
          )
      $policy$;
    else
      raise notice 'Thiếu role anon hoặc authenticated. Đã gỡ policy; không tạo policy INSERT.';
    end if;
  end if;

  if to_regclass('banla.transactions') is not null then
    execute 'alter table banla.transactions enable row level security';
    execute 'alter table banla.transactions force row level security';
    execute 'revoke all on table banla.transactions from public';

    for role_name in select rolname from pg_roles where rolname in ('anon', 'authenticated') loop
      execute format('revoke all on table banla.transactions from %I', role_name);
    end loop;

    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute 'grant select, insert, update, delete on table banla.transactions to service_role';
    end if;

    for pol in
      select policyname from pg_policies
      where schemaname = 'banla' and tablename = 'transactions'
    loop
      execute format('drop policy if exists %I on banla.transactions', pol.policyname);
    end loop;
  end if;

  for fn in
    select n.nspname as schema_name,
           p.proname as function_name,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('banla_list_bookings', 'banla_approve_booking', 'banla_update_booking')
  loop
    execute format(
      'revoke all on function %I.%I(%s) from public',
      fn.schema_name, fn.function_name, fn.args
    );
    for role_name in select rolname from pg_roles where rolname in ('anon', 'authenticated') loop
      execute format(
        'revoke all on function %I.%I(%s) from %I',
        fn.schema_name, fn.function_name, fn.args, role_name
      );
    end loop;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format(
        'grant execute on function %I.%I(%s) to service_role',
        fn.schema_name, fn.function_name, fn.args
      );
    end if;
  end loop;
end
$lock$;

commit;
