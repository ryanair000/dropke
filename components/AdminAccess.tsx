'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Mail, ShieldCheck } from 'lucide-react';
import AdminDashboard from '@/components/AdminDashboard';
import { OWNER_ADMIN_EMAIL } from '@/lib/config';
import { getBrowserSupabase } from '@/lib/supabase/browser';

export default function AdminAccess() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(OWNER_ADMIN_EMAIL);

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

  async function sendSecureLink() {
    setBusy(true);
    setMessage('');
    try {
      const { error } = await getBrowserSupabase().auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: `${window.location.origin}/admin`,
          shouldCreateUser: false,
        },
      });
      if (error) throw error;
      setMessage('If this address is an existing authorized account, a secure sign-in link has been sent.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not send the secure sign-in link.');
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
        <h1>Secure owner access</h1>
        <p>Inventory, pricing, orders and audit data are available only after Supabase verifies the allowlisted owner email.</p>
        <label className="field"><span>Authorized admin email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <button type="button" disabled={busy} onClick={sendSecureLink}><Mail size={16} /> {busy ? 'SENDING…' : 'EMAIL SECURE SIGN-IN LINK'}</button>
        {message && <div className="admin-message">{message}</div>}
        <a href="/"><ArrowLeft size={15} /> Return to store</a>
      </section>
    </main>
  );
}
