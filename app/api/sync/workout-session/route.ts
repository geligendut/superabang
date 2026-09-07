import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { OutboxOperation } from '@/src/sync/outbox';
import { assertWorkoutSyncPayload } from '@/src/sync/workout-payload';

function bearerToken(request: Request): string | undefined {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return undefined;
  return header.slice('Bearer '.length).trim();
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !publishableKey) return NextResponse.json({ error: 'BACKEND_NOT_CONFIGURED' }, { status: 503 });

  const token = bearerToken(request);
  if (!token) return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 });

  let operation: OutboxOperation;
  try {
    operation = await request.json() as OutboxOperation;
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  if (operation.aggregateType !== 'WORKOUT_SESSION' || operation.operation !== 'UPSERT') {
    return NextResponse.json({ error: 'UNSUPPORTED_OPERATION' }, { status: 400 });
  }

  let payload;
  try {
    payload = assertWorkoutSyncPayload(operation.payload);
  } catch {
    return NextResponse.json({ error: 'INVALID_WORKOUT_SYNC_PAYLOAD' }, { status: 400 });
  }

  if (payload.sessionId !== operation.aggregateId) {
    return NextResponse.json({ error: 'AGGREGATE_ID_MISMATCH' }, { status: 400 });
  }

  const supabase = createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'AUTH_INVALID' }, { status: 401 });
  }

  const { data, error } = await supabase.rpc('sync_workout_session', { p_payload: payload });
  if (error) {
    return NextResponse.json({ error: 'SYNC_REJECTED', detail: error.message }, { status: 409 });
  }

  return NextResponse.json({ ok: true, result: data });
}
