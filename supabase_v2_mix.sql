-- VibeTube Cloud v3: prevent refresh from returning the same queue
create or replace function public.generate_vt_mix(
  p_anonymous_key text,
  p_category text,
  p_size integer default 20
)
returns table(youtube_id text, title text, artist text, category text)
language plpgsql
security definer
set search_path = public
as $function$
declare
  wanted integer := greatest(1, least(coalesce(p_size,20),100));
begin
  p_category := lower(trim(coalesce(p_category,'indo')));

  create temporary table if not exists _vt_mix_pick (
    youtube_id text,
    title text,
    artist text,
    category text
  ) on commit drop;

  truncate _vt_mix_pick;

  insert into _vt_mix_pick(youtube_id,title,artist,category)
  with catalog as (
    select distinct on (c.youtube_id)
      c.youtube_id as vid,
      c.title as ttl,
      c.artist as art,
      lower(c.category) as cat,
      coalesce(max(e.created_at) filter (
        where e.anonymous_key = p_anonymous_key
          and e.event_type in ('mix_served','play','complete')
      ), to_timestamp(0)) as last_seen
    from public.vt_catalog c
    left join public.vt_events e on e.youtube_id=c.youtube_id
    where c.active and lower(c.category)=p_category
    group by c.youtube_id,c.title,c.artist,c.category
  )
  select cat.vid,cat.ttl,cat.art,cat.cat
  from catalog cat
  order by
    case when cat.last_seen = to_timestamp(0) then 0 else 1 end,
    cat.last_seen asc,
    random()
  limit wanted;

  return query
  select p.youtube_id,p.title,p.artist,p.category
  from _vt_mix_pick p
  order by random();

  insert into public.vt_events(anonymous_key,youtube_id,event_type,created_at)
  select p_anonymous_key,p.youtube_id,'mix_served',now()
  from _vt_mix_pick p;
end;
$function$;
