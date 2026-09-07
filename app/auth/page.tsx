'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/src/backend/supabase-browser';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (!configured) return;
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => setSignedInAs(data.user?.email ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setSignedInAs(session?.user.email ?? null));
    return () => listener.subscription.unsubscribe();
  }, [configured]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setStatus('Signing in…');
    try {
      const { error } = await getSupabaseBrowserClient().auth.signInWithPassword({ email, password });
      setStatus(error ? error.message : 'Signed in. Workout sync is now available.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function createAccount() {
    setStatus('Creating account…');
    try {
      const { data, error } = await getSupabaseBrowserClient().auth.signUp({ email, password });
      if (error) {
        setStatus(error.message);
        return;
      }
      setStatus(data.session
        ? 'Account created and signed in.'
        : 'Account created. Check your email if confirmation is required before signing in.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function signOut() {
    const { error } = await getSupabaseBrowserClient().auth.signOut();
    setStatus(error ? error.message : 'Signed out. Local workout history is retained on this device.');
  }

  return <main>
    <h1>Superabang account</h1>
    <p className="muted">Authentication is required only for server sync. Workout logging and local history remain available offline.</p>
    {!configured && <div className="card"><strong>Backend not configured.</strong><p className="muted">Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY before live dogfood.</p></div>}
    {configured && signedInAs && <div className="card"><strong>Signed in</strong><p>{signedInAs}</p><button onClick={signOut}>Sign out</button></div>}
    {configured && !signedInAs && <form className="card form-grid" onSubmit={signIn}>
      <label className="span-2">Email<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
      <label className="span-2">Password<input type="password" minLength={8} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
      <button className="primary span-2" type="submit">Sign in</button>
      <button className="span-2" type="button" onClick={createAccount}>Create dogfood account</button>
      <p className="muted span-2">Use a dedicated dogfood account. Whether email confirmation is required follows the Supabase Auth configuration.</p>
    </form>}
    {status && <div className="card" role="status">{status}</div>}
    <Link href="/history">Back to history</Link>
  </main>;
}
