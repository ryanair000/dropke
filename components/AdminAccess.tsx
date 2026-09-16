'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, KeyRound, ShieldCheck } from 'lucide-react';
import AdminDashboard from '@/components/AdminDashboard';
import { OWNER_ADMIN_EMAIL } from '@/lib/config';
import { getBrowserSupabase } from '@/lib/supabase/browser';

export default function AdminAccess() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [mode, setMode] = useState<'signin' | 'setup'>('signin');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    try {
      const supabase = getBrowserSupabase();
      supabase.auth.getSession().then(({ data }) => {
        if (!active) return;
        setSignedIn(Boolean(data.session));
        setReady(true);
      });
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!active) return;
        setSignedIn(Boolean(session));
        setReady(true);
      });
      return () => {
        active = false;
        listener.subscription.unsubscribe();
      };
    } catch {
      setMessage('Admin authentication is not configured.');
      setReady(true);
    }
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage('');
    if (password.length < 12) {
      setMessage('Use at least 12 characters for the admin password.');
      return;
    }
    setBusy(true);
    try {
      const supabase = getBrowserSupabase();
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: OWNER_ADMIN_EMAIL, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: OWNER_ADMIN_EMAIL,
          password,
          options: { emailRedirectTo: `${window.location.origin}/admin` },
        });
        if (error) throw error;
        if (!data.session) {
          setPassword('');
          setMode('signin');
          setMessage('Admin account created. Confirm the email Supabase sends you, then return here and sign in.');
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Admin sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return <main className="admin-login"><section><ShieldCheck size={44} /><p className="eyebrow dark">DROPKE ADMIN</p><h1>Checking secure session…</h1></section></main>;
  }

  if (signedIn) return <AdminDashboard />;

  return (
    <main className="admin-login">
      <section>
        <ShieldCheck size={44} />
        <p className="eyebrow dark">DROPKE ADMIN</p>
        <h1>{mode === 'signin' ? 'Secure sign in' : 'First-time admin setup'}</h1>
        <p>Only the allowlisted owner account can open inventory, pricing, order and audit controls.</p>
        <div className="admin-security-row"><span>Authorized email</span><strong>{OWNER_ADMIN_EMAIL}</strong></div>
        <form onSubmit={submit}>
          <label>
            <span>Admin password</span>
            <input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} required />
          </label>
          <button disabled={busy}><KeyRound size={16} /> {busy ? 'PLEASE WAIT…' : mode === 'signin' ? 'SIGN IN' : 'CREATE ADMIN ACCESS'}</button>
        </form>
        {message && <div className="admin-message">{message}</div>}
        <button className="admin-mode-switch" type="button" onClick={() => { setMode(mode === 'signin' ? 'setup' : 'signin'); setMessage(''); setPassword(''); }}>
          {mode === 'signin' ? 'First time here? Create admin access' : 'Already set up? Sign in instead'}
        </button>
        <a href="/"><ArrowLeft size={15} /> Return to store</a>
      </section>
    </main>
  );
}
