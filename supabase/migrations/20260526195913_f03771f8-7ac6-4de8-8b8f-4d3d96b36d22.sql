
-- Public bucket for menu item images
insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do nothing;

-- Public read
create policy "menu images public read"
on storage.objects for select
using (bucket_id = 'menu-images');

-- Owners can upload to a folder named after their restaurant id
create policy "owners upload menu images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'menu-images'
  and exists (
    select 1 from public.restaurants r
    where r.owner_id = auth.uid()
      and r.id::text = (storage.foldername(name))[1]
  )
);

create policy "owners update menu images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'menu-images'
  and exists (
    select 1 from public.restaurants r
    where r.owner_id = auth.uid()
      and r.id::text = (storage.foldername(name))[1]
  )
);

create policy "owners delete menu images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'menu-images'
  and exists (
    select 1 from public.restaurants r
    where r.owner_id = auth.uid()
      and r.id::text = (storage.foldername(name))[1]
  )
);
