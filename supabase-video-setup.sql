-- 旅行视频存储桶：一次性配置
-- 用法：Supabase 控制台 → 左侧 SQL Editor → New query → 粘贴整段 → Run。
-- 重复运行也没关系。

-- 1. 建一个公开存储桶，单个视频最大 50MB（免费版上限），只收视频文件
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('travel-videos', 'travel-videos', true, 52428800, array['video/*'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. 允许网页（anon key）上传、删除这个桶里的视频
--    删除时 Supabase 要求同时有 select 和 delete 权限
drop policy if exists "travel-videos select" on storage.objects;
create policy "travel-videos select" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'travel-videos');

drop policy if exists "travel-videos insert" on storage.objects;
create policy "travel-videos insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'travel-videos');

drop policy if exists "travel-videos delete" on storage.objects;
create policy "travel-videos delete" on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'travel-videos');
