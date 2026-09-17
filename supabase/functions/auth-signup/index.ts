import { createClient } from 'npm:@supabase/supabase-js@2';
import { cors, json } from '../_shared/cors.ts';

const usernameOK = (value: unknown) => typeof value === 'string' && /^[A-Za-z]{1,10}$/.test(value);
const passwordOK = (value: unknown) => typeof value === 'string' && /^\d{8,}$/.test(value);
const emailFor = (username: string) => `${username}@piggy.local`;

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors(request) });
  if (request.method !== 'POST') return json(request, { code: 'method_not_allowed' }, 405);
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
    const { data: permitted } = await admin.rpc('check_auth_rate_limit', { key_input: `signup:${ip}` });
    if (!permitted) return json(request, { code: 'rate_limited' }, 429);
    const { username, password } = await request.json();
    if (!usernameOK(username)) return json(request, { code: 'invalid_username' }, 400);
    if (!passwordOK(password)) return json(request, { code: 'invalid_password' }, 400);
    const normalized = username.toLowerCase();
    const { data: existing } = await admin.from('players').select('id').eq('username_normalized', normalized).maybeSingle();
    if (existing) return json(request, { code: 'username_taken' }, 409);
    const { error: createError } = await admin.auth.admin.createUser({
      email: emailFor(normalized), password, email_confirm: true,
      user_metadata: { username, username_normalized: normalized }
    });
    if (createError) return json(request, { code: 'username_taken' }, 409);
    const publicClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data, error } = await publicClient.auth.signInWithPassword({ email: emailFor(normalized), password });
    if (error || !data.session) return json(request, { code: 'signup_failed' }, 500);
    return json(request, { session: data.session });
  } catch { return json(request, { code: 'invalid_request' }, 400); }
});
