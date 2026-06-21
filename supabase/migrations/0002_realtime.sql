-- Expose the tables phones/admin subscribe to via Realtime Postgres Changes.
-- (room_secrets is deliberately NOT published.)
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table participants;
alter publication supabase_realtime add table rounds;
alter publication supabase_realtime add table pairings;
alter publication supabase_realtime add table submissions;
