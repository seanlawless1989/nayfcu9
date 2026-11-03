-- Newton Aycliffe club admin: the club, its teams on Touchline Tales and its first club lead. Run after 26_club_admin.sql
-- in the NAYFC Supabase project (elqwksyqwezhkekdqivn). Safe to re-run. More admins are added on the club admin page.
insert into club.clubs (id, name) values ('newton-aycliffe', 'Newton Aycliffe Youth Football Club')
  on conflict (id) do update set name = excluded.name;
insert into club.teams (club, team_schema, name, url, show_scores, sort) values
  ('newton-aycliffe', 'public',          'Under 9s Wildcats',  'https://touchlinetales.club/newton-aycliffe-u9s/',            false, 1),
  ('newton-aycliffe', 'na_u11_pumas',    'Under 11s Pumas',    'https://touchlinetales.club/newton-aycliffe-u11s-pumas/',     false, 2),
  ('newton-aycliffe', 'na_u11_wildcats', 'Under 11s Wildcats', 'https://touchlinetales.club/newton-aycliffe-u11s-wildcats/',  false, 3)
  on conflict (club, team_schema) do update set name = excluded.name, url = excluded.url, sort = excluded.sort;
insert into club.admins (club, email, role) values ('newton-aycliffe', 'sean.nayfc@outlook.com', 'lead')
  on conflict (club, email) do nothing;
