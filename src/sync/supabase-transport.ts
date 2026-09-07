'use client';

import { getSupabaseBrowserClient } from '../backend/supabase-browser';
import type { OutboxOperation } from './outbox';
import type { SyncTransport } from './processor';

export class SupabaseApiTransport implements SyncTransport {
  async push(operation: OutboxOperation): Promise<{ ok: true } | { ok: false; error: string }> {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.auth.getSession();
    if (error) return { ok: false, error: `AUTH_SESSION_ERROR:${error.message}` };
    const token = data.session?.access_token;
    if (!token) return { ok: false, error: 'AUTH_REQUIRED' };

    const response = await fetch('/api/sync/workout-session', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(operation),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return { ok: false, error: `SYNC_HTTP_${response.status}:${body.slice(0, 240)}` };
    }
    return { ok: true };
  }
}
