// Supabase project details (Project Settings > API).
// The anon key is meant to be public; the database rules decide who can change data.
window.NAYFC_CONFIG = {
  supabaseUrl: "https://elqwksyqwezhkekdqivn.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVscXdrc3lxd2V6aGtla2RxaXZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3NDA4MzAsImV4cCI6MjEwNzMxNjgzMH0.7HFhSDvpQS5WHDgu4x5ABat-8hl5ZIpmeFlp2pV9wts",
  // Public half of the match-alerts key pair. The private half is a secret on the "notify" edge function.
  vapidPublicKey: "BLccA0UCmxDmbV7HnKdgbxhgBqHssQZHoRg8Y-sJZupmyfFjtvTtbNIrR1AW9DUu-UnRg8VtBMVps79_Hc5oVGc"
};
