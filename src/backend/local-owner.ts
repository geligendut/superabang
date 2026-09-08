'use client';

import { getSupabaseBrowserClient, isSupabaseConfigured } from './supabase-browser';

/**
 * Returns the locally persisted Supabase user id without requiring a network round-trip.
 * null means this browser is currently operating as a signed-out/local-only guest.
 */
export async function getLocalOwnerUserId(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await getSupabaseBrowserClient().auth.getSession();
  if (error) throw error;
  return data.session?.user.id ?? null;
}
