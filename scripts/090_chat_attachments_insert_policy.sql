-- Allow authenticated users to INSERT their own chat_attachments rows via the
-- browser client (register/upload routes use createClient(), not service-role).

drop policy if exists "chat_attachments_insert_own" on public.chat_attachments;
create policy "chat_attachments_insert_own"
  on public.chat_attachments
  for insert
  with check (
    user_id = (select auth.uid())
    and session_id in (
      select id from public.chat_sessions
      where user_id = (select auth.uid())
    )
  );

drop policy if exists "chat_attachments_update_own" on public.chat_attachments;
create policy "chat_attachments_update_own"
  on public.chat_attachments
  for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
