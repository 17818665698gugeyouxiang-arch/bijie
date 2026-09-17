import { createClient } from 'npm:@supabase/supabase-js@2';
import { cors, json } from '../_shared/cors.ts';

const emailFor = (username: string) => `${username}@piggy.local`;
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors(request) });
  if (request.method !== 'POST') return json(request, { code: 'method_not_allowed' }, 405);
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
    const { data: permitted } = await admin.rpc('check_auth_rate_limit', { key_input: `login:${ip}` });
    if (!permitted) return json(request, { code: 'rate_limited' }, 429);
    const { username, password } = await request.json();
    if (typeof username !== 'string' || !/^[A-Za-z]{1,10}$/.test(username)) return json(request, { code: 'account_not_found' }, 404);
    if (typeof password !== 'string' || !/^\d{8,}$/.test(password)) return json(request, { code: 'incorrect_password' }, 401);
    const normalized = username.toLowerCase();
    const { data: player } = await admin.from('players').select('id').eq('username_normalized', normalized).maybeSingle();
    if (!player) return json(request, { code: 'account_not_found' }, 404);
    const publicClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data, error } = await publicClient.auth.signInWithPassword({ email: emailFor(normalized), password });
    if (error || !data.session) return json(request, { code: 'incorrect_password' }, 401);
    await admin.from('players').update({ last_login_at: new Date().toISOString() }).eq('id', player.id);
    return json(request, { session: data.session });
  } catch { return json(request, { code: 'invalid_request' }, 400); }
});
