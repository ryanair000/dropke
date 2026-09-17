drop policy if exists deny_anon_authenticated on public.admin_users;
create policy deny_anon_authenticated on public.admin_users
as restrictive for all to anon, authenticated
using (false) with check (false);
