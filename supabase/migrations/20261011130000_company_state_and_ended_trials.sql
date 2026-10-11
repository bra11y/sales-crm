alter table public.companies add column state_at timestamptz;

create or replace view public.company_list with (security_invoker = true) as
select
  c.id,
  c.workspace_id,
  c.product,
  c.name,
  case when ended.company_id is not null then 'Trial ended' else c.stage end as stage,
  c.segment,
  p.name as owner_name,
  (select count(*) from public.deals d where d.company_id = c.id and d.status = 'open')::int as open_deals,
  c.pipeline_value_minor,
  c.currency,
  case when ended.company_id is not null then least(c.win_probability, 15) else c.win_probability end as win_probability,
  la.at as last_interaction_at,
  la.summary as last_interaction_label,
  array(
    select count(a.id)::int
    from generate_series(13, 0, -1) as w
    left join public.activities a
      on a.company_id = c.id
     and a.at >= now() - ((w + 1) * interval '7 days')
     and a.at < now() - (w * interval '7 days')
    group by w
    order by w desc
  ) as trend
from public.companies c
left join public.profiles p on p.user_id = c.owner_id
left join lateral (
  select s.company_id from public.subscriptions s
  where s.company_id = c.id and s.status = 'trialing' and s.renews_at <= now()
  limit 1
) ended on true
left join lateral (
  select a.at, a.summary from public.activities a
  where a.company_id = c.id order by a.at desc limit 1
) la on true;
