'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Boxes, KeyRound, LockKeyhole, LogOut, PackagePlus, RefreshCw, ShieldCheck, ShoppingBag } from 'lucide-react';
import { OWNER_ADMIN_EMAIL } from '@/lib/config';
import { getBrowserSupabase } from '@/lib/supabase/browser';

async function api<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? 'Admin request failed');
  return payload as T;
}

type Stock = { id: string; sku: string; platform: string; region_code: string; region_name: string; currency: string; denomination: number; sell_price_kes: number; low_stock_threshold: number; available_count: number; reserved_count: number; sold_count: number };
type Summary = { skuCount: number; available: number; reserved: number; sold: number; lowStock: number; orderCount: number; paidPending: number; encryptionReady: boolean; paystackMode: string };
type Batch = { id: string; batch_ref: string; sku_id: string; supplier_name: string; supplier_ref?: string; unit_cost_kes: number; quantity: number; created_at: string; created_by: string };
type Order = { ref: string; product_name: string; platform: string; region_name: string; kes_price: number; payment_status: string; status: string; created_at: string };
type Audit = { id: string; actor_email: string; action: string; resource: string; details: Record<string, unknown>; created_at: string };

export default function AdminDashboard() {
  const [token, setToken] = useState('');
  const [email, setEmail] = useState(OWNER_ADMIN_EMAIL);
  const [message, setMessage] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [stock, setStock] = useState<Stock[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [price, setPrice] = useState('');
  const [threshold, setThreshold] = useState('2');
  const [supplierName, setSupplierName] = useState('');
  const [supplierRef, setSupplierRef] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [codes, setCodes] = useState('');
  const [busy, setBusy] = useState(false);
  const selected = useMemo(() => stock.find((item) => item.id === selectedId) ?? null, [stock, selectedId]);

  useEffect(() => {
    try {
      const supabase = getBrowserSupabase();
      supabase.auth.getSession().then(({ data }) => { if (data.session?.access_token) setToken(data.session.access_token); });
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setToken(session?.access_token ?? ''));
      return () => listener.subscription.unsubscribe();
    } catch { setMessage('Supabase browser authentication is not configured yet.'); }
  }, []);
  useEffect(() => { if (token) loadAll(); }, [token]);
  useEffect(() => { if (selected) { setPrice(String(selected.sell_price_kes)); setThreshold(String(selected.low_stock_threshold)); } }, [selected]);

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault(); setMessage('');
    try {
      const { error } = await getBrowserSupabase().auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/admin` } });
      if (error) throw error;
      setMessage('Magic sign-in link sent. Check your email.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not send sign-in link.'); }
  }
  async function signOut() { await getBrowserSupabase().auth.signOut(); setToken(''); setSummary(null); setStock([]); setBatches([]); setOrders([]); setAudit([]); }
  async function loadAll() {
    setBusy(true); setMessage('');
    try {
      const [nextSummary, nextStock, nextBatches, nextOrders, nextAudit] = await Promise.all([api<Summary>('/api/admin/summary', token), api<Stock[]>('/api/admin/inventory', token), api<Batch[]>('/api/admin/batches', token), api<Order[]>('/api/admin/orders', token), api<Audit[]>('/api/admin/audit', token)]);
      setSummary(nextSummary); setStock(nextStock); setBatches(nextBatches); setOrders(nextOrders); setAudit(nextAudit);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load admin.'); }
    finally { setBusy(false); }
  }
  async function saveSku() {
    if (!selected) return; setBusy(true); setMessage('');
    try { await api(`/api/admin/skus/${selected.id}`, token, { method: 'PUT', body: JSON.stringify({ sellPriceKes: Number(price), lowStockThreshold: Number(threshold) }) }); setMessage(`${selected.sku} updated.`); await loadAll(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update SKU.'); setBusy(false); }
  }
  async function addBatch() {
    if (!selected) return;
    const values = codes.split(/\n+/).map((value) => value.trim()).filter(Boolean);
    if (!supplierName.trim() || !values.length) { setMessage('Supplier name and at least one code are required.'); return; }
    setBusy(true); setMessage('');
    try {
      const result = await api<{ batchRef: string; quantity: number }>('/api/admin/batches', token, { method: 'POST', body: JSON.stringify({ skuId: selected.id, supplierName, supplierRef, unitCostKes: Number(unitCost), codes: values }) });
      setMessage(`${result.batchRef}: ${result.quantity} encrypted codes added.`); setCodes(''); setSupplierRef(''); setUnitCost(''); await loadAll();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not create batch.'); setBusy(false); }
  }

  if (!token) return <main className="admin-login"><section><ShieldCheck size={44} /><p className="eyebrow dark">DROPKE ADMIN</p><h1>Secure operations</h1><p>Inventory and order data load only after Supabase verifies an allowlisted admin email.</p><div className="admin-security-row"><span>Owner admin</span><strong>{OWNER_ADMIN_EMAIL}</strong></div><form onSubmit={sendMagicLink}><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /><button>SEND MAGIC SIGN-IN LINK</button></form>{message && <div className="admin-message">{message}</div>}<a href="/"><ArrowLeft size={15} /> Return to store</a></section></main>;

  return <main className="admin-page"><header className="admin-nav"><a className="brand" href="/">DROP<span>KE</span></a><div><span>{OWNER_ADMIN_EMAIL}</span><button onClick={loadAll}><RefreshCw size={15} /> Refresh</button><button onClick={signOut}><LogOut size={15} /> Sign out</button></div></header><div className="admin-container"><div className="admin-heading"><div><p className="eyebrow dark">OPERATIONS</p><h1>Inventory & fulfilment</h1><p>Real code values stay encrypted and never appear in admin list responses.</p></div><span className={summary?.encryptionReady ? 'ready-pill' : 'warn-pill'}>{summary?.encryptionReady ? 'VAULT READY' : 'VAULT KEY REQUIRED'}</span></div>{message && <div className="admin-message">{message}</div>}<div className="admin-stats"><article><Boxes /><span>Available</span><strong>{summary?.available ?? '—'}</strong></article><article><KeyRound /><span>Reserved</span><strong>{summary?.reserved ?? '—'}</strong></article><article><ShoppingBag /><span>Sold</span><strong>{summary?.sold ?? '—'}</strong></article><article><LockKeyhole /><span>Needs attention</span><strong>{summary?.paidPending ?? '—'}</strong></article></div><div className="admin-grid"><section className="admin-card"><div className="admin-card-head"><div><h2>SKU inventory</h2><p>{summary?.skuCount ?? stock.length} platform-region denominations</p></div><span>{busy ? 'SYNCING' : 'LIVE COUNTS'}</span></div><div className="table-wrap"><table><thead><tr><th>SKU</th><th>Credit</th><th>Available</th><th>Reserved</th><th>Sold</th><th>KSh</th></tr></thead><tbody>{stock.map((item) => <tr className={item.id === selectedId ? 'selected' : ''} onClick={() => setSelectedId(item.id)} key={item.id}><td><strong>{item.sku}</strong><small>{item.platform} · {item.region_name}</small></td><td>{item.currency} {Number(item.denomination)}</td><td>{item.available_count}</td><td>{item.reserved_count}</td><td>{item.sold_count}</td><td>{Number(item.sell_price_kes).toLocaleString()}</td></tr>)}</tbody></table></div></section><aside className="admin-card sku-manager"><div className="admin-card-head"><div><h2>Manage SKU</h2><p>{selected?.sku ?? 'Select a row'}</p></div></div>{selected ? <><label>Selling price (KSh)<input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="numeric" /></label><label>Low stock threshold<input value={threshold} onChange={(event) => setThreshold(event.target.value)} inputMode="numeric" /></label><button onClick={saveSku} disabled={busy}>SAVE SETTINGS</button><hr /><h3>Encrypted supplier batch</h3><label>Supplier<input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} /></label><label>Supplier reference<input value={supplierRef} onChange={(event) => setSupplierRef(event.target.value)} /></label><label>Unit cost (KSh)<input value={unitCost} onChange={(event) => setUnitCost(event.target.value)} inputMode="decimal" /></label><label>Codes, one per line<textarea value={codes} onChange={(event) => setCodes(event.target.value)} /></label><small>Codes are encrypted server-side before storage.</small><button onClick={addBatch} disabled={busy || !summary?.encryptionReady}><PackagePlus size={15} /> ENCRYPT & ADD BATCH</button></> : <p className="empty-admin">Select an inventory row to manage pricing and stock.</p>}</aside></div><section className="admin-card admin-wide"><div className="admin-card-head"><div><h2>Supplier batches</h2><p>Cost and provenance without plaintext codes</p></div></div><div className="table-wrap"><table><thead><tr><th>Batch</th><th>SKU</th><th>Supplier</th><th>Ref</th><th>Qty</th><th>Unit cost</th></tr></thead><tbody>{batches.map((batch) => <tr key={batch.id}><td>{batch.batch_ref}</td><td>{stock.find((item) => item.id === batch.sku_id)?.sku ?? batch.sku_id.slice(0, 8)}</td><td>{batch.supplier_name}</td><td>{batch.supplier_ref || '—'}</td><td>{batch.quantity}</td><td>KSh {Number(batch.unit_cost_kes).toLocaleString()}</td></tr>)}</tbody></table></div></section><section className="admin-card admin-wide"><div className="admin-card-head"><div><h2>Recent orders</h2><p>Payment and fulfilment tracked separately</p></div></div><div className="table-wrap"><table><thead><tr><th>Order</th><th>Product</th><th>Setup</th><th>Total</th><th>Payment</th><th>Delivery</th></tr></thead><tbody>{orders.map((order) => <tr key={order.ref}><td>{order.ref}</td><td>{order.product_name}</td><td>{order.platform} · {order.region_name}</td><td>KSh {order.kes_price.toLocaleString()}</td><td>{order.payment_status}</td><td>{order.status}</td></tr>)}</tbody></table></div></section><section className="admin-card admin-wide"><div className="admin-card-head"><div><h2>Audit log</h2><p>Administrative changes</p></div></div><div className="table-wrap"><table><thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Resource</th></tr></thead><tbody>{audit.map((entry) => <tr key={entry.id}><td>{new Date(entry.created_at).toLocaleString()}</td><td>{entry.actor_email}</td><td>{entry.action}</td><td>{entry.resource}</td></tr>)}</tbody></table></div></section></div></main>;
}
