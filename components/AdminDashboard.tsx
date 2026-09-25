'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Boxes, KeyRound, LockKeyhole, LogOut,
  PackagePlus, RefreshCw, Search, ShieldCheck, ShoppingBag,
} from 'lucide-react';
import { OWNER_ADMIN_EMAIL as DEFAULT_ADMIN_EMAIL } from '@/lib/config';
import { getBrowserSupabase } from '@/lib/supabase/browser';

async function api<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? 'Admin request failed');
  return payload as T;
}

type Stock = {
  id: string; sku: string; platform: string; region_code: string; region_name: string;
  currency: string; denomination: number; sell_price_kes: number; low_stock_threshold: number;
  available_count: number; reserved_count: number; sold_count: number;
};
type Summary = {
  skuCount: number; available: number; reserved: number; sold: number; lowStock: number;
  orderCount: number; paidPending: number; recoveryJobs: number; encryptionReady: boolean; paystackMode: string;
};
type Batch = {
  id: string; batch_ref: string; sku_id: string; supplier_name: string; supplier_ref?: string;
  unit_cost_kes: number; quantity: number; created_at: string; created_by: string;
};
type Order = {
  ref: string; product_name: string; platform: string; region_name: string; kes_price: number;
  payment_status: string; status: string; created_at: string;
};
type Audit = {
  id: string; actor_email: string; action: string; resource: string;
  details: Record<string, unknown>; created_at: string;
};

function statusTone(status: string) {
  if (['paid', 'fulfilled', 'delivered', 'complete'].includes(status)) return 'good';
  if (['failed', 'cancelled', 'refunded'].includes(status)) return 'bad';
  return 'wait';
}

function displayStatus(status: string) {
  return status.replaceAll('_', ' ');
}

export default function AdminDashboard() {
  const [token, setToken] = useState('');
  const [email, setEmail] = useState(DEFAULT_ADMIN_EMAIL);
  const [message, setMessage] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [stock, setStock] = useState<Stock[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [price, setPrice] = useState('');
  const [threshold, setThreshold] = useState('2');
  const [supplierName, setSupplierName] = useState('');
  const [supplierRef, setSupplierRef] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [codes, setCodes] = useState('');
  const [busy, setBusy] = useState(false);

  const adminEmail = email || 'Authorized admin';
  const selected = useMemo(() => stock.find((item) => item.id === selectedId) ?? null, [stock, selectedId]);
  const visibleStock = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return stock;
    return stock.filter((item) => [item.sku, item.platform, item.region_name, item.currency]
      .some((value) => value.toLowerCase().includes(query)));
  }, [search, stock]);

  useEffect(() => {
    try {
      const supabase = getBrowserSupabase();
      supabase.auth.getSession().then(({ data }) => {
        if (data.session?.access_token) setToken(data.session.access_token);
        if (data.session?.user.email) setEmail(data.session.user.email);
      });
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        setToken(session?.access_token ?? '');
        setEmail(session?.user.email ?? '');
      });
      return () => listener.subscription.unsubscribe();
    } catch {
      setMessage('Supabase browser authentication is not configured yet.');
    }
  }, []);

  // loadAll intentionally follows token changes; its other dependencies are stable state setters.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (token) loadAll(); }, [token]);

  useEffect(() => {
    if (!selected) return;
    setPrice(String(selected.sell_price_kes));
    setThreshold(String(selected.low_stock_threshold));
  }, [selected]);

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    setMessage('');
    try {
      const { error } = await getBrowserSupabase().auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/admin`, shouldCreateUser: false },
      });
      if (error) throw error;
      setMessage('Magic sign-in link sent. Check your email.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not send sign-in link.');
    }
  }

  async function signOut() {
    await getBrowserSupabase().auth.signOut();
    setToken('');
    setSummary(null);
    setStock([]);
    setBatches([]);
    setOrders([]);
    setAudit([]);
  }

  async function loadAll() {
    setBusy(true);
    setMessage('');
    try {
      const [nextSummary, nextStock, nextBatches, nextOrders, nextAudit] = await Promise.all([
        api<Summary>('/api/admin/summary', token),
        api<Stock[]>('/api/admin/inventory', token),
        api<Batch[]>('/api/admin/batches', token),
        api<Order[]>('/api/admin/orders', token),
        api<Audit[]>('/api/admin/audit', token),
      ]);
      setSummary(nextSummary);
      setStock(nextStock);
      setBatches(nextBatches);
      setOrders(nextOrders);
      setAudit(nextAudit);
      if (!selectedId && nextStock.length) setSelectedId(nextStock[0].id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load admin.');
    } finally {
      setBusy(false);
    }
  }

  async function saveSku() {
    if (!selected) return;
    setBusy(true);
    setMessage('');
    try {
      await api(`/api/admin/skus/${selected.id}`, token, {
        method: 'PUT',
        body: JSON.stringify({ sellPriceKes: Number(price), lowStockThreshold: Number(threshold) }),
      });
      await loadAll();
      setMessage(`${selected.sku} updated.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update SKU.');
      setBusy(false);
    }
  }

  async function addBatch() {
    if (!selected) return;
    const values = codes.split(/\n+/).map((value) => value.trim()).filter(Boolean);
    if (!supplierName.trim() || !values.length) {
      setMessage('Supplier name and at least one code are required.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const result = await api<{ batchRef: string; quantity: number }>('/api/admin/batches', token, {
        method: 'POST',
        body: JSON.stringify({
          skuId: selected.id,
          supplierName,
          supplierRef,
          unitCostKes: Number(unitCost),
          codes: values,
        }),
      });
      setCodes('');
      setSupplierRef('');
      setUnitCost('');
      await loadAll();
      setMessage(`${result.batchRef}: ${result.quantity} encrypted codes added.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create batch.');
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <main className="admin-login">
        <section>
          <ShieldCheck size={44} />
          <p className="eyebrow">DROPKE ADMIN</p>
          <h1>Secure operations</h1>
          <p>Inventory and order data load only after Supabase verifies an allowlisted admin email.</p>
          <div className="admin-security-row"><span>Owner admin</span><strong>{adminEmail}</strong></div>
          <form onSubmit={sendMagicLink}>
            <label className="admin-field"><span>Admin email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
            <button type="submit">Send magic sign-in link</button>
          </form>
          {message && <div className="admin-message" role="status">{message}</div>}
          <a href="/"><ArrowLeft size={15} /> Return to store</a>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <header className="admin-nav">
        <a className="brand" href="/"><span className="brand-mark">D</span>DROP<span>KE</span></a>
        <div>
          <span>{adminEmail}</span>
          <button type="button" onClick={loadAll} disabled={busy}><RefreshCw size={15} /> Refresh</button>
          <button type="button" onClick={signOut}><LogOut size={15} /> Sign out</button>
        </div>
      </header>

      <div className="admin-container">
        <div className="admin-heading">
          <div><p className="eyebrow">OPERATIONS</p><h1>Inventory & fulfilment</h1><p>See what needs action, manage sellable credit, and trace every change.</p></div>
          <span className={summary?.encryptionReady ? 'ready-pill' : 'warn-pill'}>{summary?.encryptionReady ? 'VAULT READY' : 'VAULT KEY REQUIRED'}</span>
        </div>

        {message && <div className="admin-message" role="status" aria-live="polite">{message}</div>}

        {(summary?.paidPending || summary?.recoveryJobs) ? (
          <aside className="admin-attention">
            <div><AlertTriangle /><span><strong>Action queue</strong>{summary.paidPending} paid order{summary.paidPending === 1 ? '' : 's'} awaiting fulfilment · {summary.recoveryJobs} recovery job{summary.recoveryJobs === 1 ? '' : 's'}</span></div>
            <a href="#recent-orders">Review recent orders</a>
          </aside>
        ) : null}

        <div className="admin-stats" aria-label="Operations summary">
          <article><Boxes /><span>Available codes</span><strong>{summary?.available ?? '—'}</strong></article>
          <article><KeyRound /><span>Reserved</span><strong>{summary?.reserved ?? '—'}</strong></article>
          <article><ShoppingBag /><span>Sold</span><strong>{summary?.sold ?? '—'}</strong></article>
          <article><LockKeyhole /><span>Needs attention</span><strong>{summary?.paidPending ?? '—'}</strong></article>
        </div>

        <div className="admin-grid">
          <section className="admin-card">
            <div className="admin-card-head">
              <div><h2>SKU inventory</h2><p>{visibleStock.length} of {summary?.skuCount ?? stock.length} platform-region denominations</p></div>
              <div className="admin-toolbar">
                <label><span className="sr-only">Search inventory</span><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search SKU or region" /></label>
                <span className="admin-live-pill">{busy ? 'SYNCING' : 'LIVE'}</span>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>SKU</th><th>Credit</th><th>Available</th><th>Reserved</th><th>Sold</th><th>KSh</th></tr></thead>
                <tbody>
                  {visibleStock.map((item) => (
                    <tr className={item.id === selectedId ? 'selected' : ''} key={item.id}>
                      <td><button className="sku-select-button" type="button" onClick={() => setSelectedId(item.id)} aria-pressed={item.id === selectedId}>{item.sku}<small>{item.platform} · {item.region_name}</small></button></td>
                      <td>{item.currency} {Number(item.denomination).toLocaleString()}</td>
                      <td className={item.available_count <= item.low_stock_threshold ? 'count-low' : ''}>{item.available_count}</td>
                      <td>{item.reserved_count}</td><td>{item.sold_count}</td><td>{Number(item.sell_price_kes).toLocaleString()}</td>
                    </tr>
                  ))}
                  {!visibleStock.length && <tr><td colSpan={6} className="empty-table">No inventory matches this search.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="admin-card sku-manager">
            <div className="admin-card-head"><div><h2>Manage SKU</h2><p>{selected?.sku ?? 'Choose an inventory item'}</p></div></div>
            <div className="sku-manager-body">
              {selected ? <>
                <label>Selling price (KSh)<input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="numeric" /></label>
                <label>Low stock threshold<input value={threshold} onChange={(event) => setThreshold(event.target.value)} inputMode="numeric" /></label>
                <button type="button" onClick={saveSku} disabled={busy}>Save pricing settings</button>
                <hr />
                <h3>Add encrypted supplier batch</h3>
                <label>Supplier<input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} /></label>
                <label>Supplier reference<input value={supplierRef} onChange={(event) => setSupplierRef(event.target.value)} /></label>
                <label>Unit cost (KSh)<input value={unitCost} onChange={(event) => setUnitCost(event.target.value)} inputMode="decimal" /></label>
                <label>Codes, one per line<textarea value={codes} onChange={(event) => setCodes(event.target.value)} /></label>
                <small>Codes are encrypted on the server before storage.</small>
                <button type="button" onClick={addBatch} disabled={busy || !summary?.encryptionReady}><PackagePlus size={15} /> Encrypt & add batch</button>
              </> : <p className="empty-admin">Choose an inventory item to manage its pricing and stock.</p>}
            </div>
          </aside>

          <section className="admin-card" id="recent-orders">
            <div className="admin-card-head"><div><h2>Recent orders</h2><p>Payment and fulfilment are tracked separately</p></div><span className="admin-live-pill">{orders.length} ORDERS</span></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Order</th><th>Product</th><th>Setup</th><th>Total</th><th>Payment</th><th>Delivery</th></tr></thead>
                <tbody>
                  {orders.map((order) => <tr key={order.ref}><td><strong>{order.ref}</strong></td><td>{order.product_name}</td><td>{order.platform} · {order.region_name}</td><td>KSh {order.kes_price.toLocaleString()}</td><td><span className={`admin-status ${statusTone(order.payment_status)}`}>{displayStatus(order.payment_status)}</span></td><td><span className={`admin-status ${statusTone(order.status)}`}>{displayStatus(order.status)}</span></td></tr>)}
                  {!orders.length && <tr><td colSpan={6} className="empty-table">No orders yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="admin-two-column">
          <section className="admin-card admin-wide">
            <div className="admin-card-head"><div><h2>Supplier batches</h2><p>Cost and provenance without plaintext codes</p></div></div>
            <div className="table-wrap"><table><thead><tr><th>Batch</th><th>SKU</th><th>Supplier</th><th>Ref</th><th>Qty</th><th>Unit cost</th></tr></thead><tbody>{batches.map((batch) => <tr key={batch.id}><td><strong>{batch.batch_ref}</strong></td><td>{stock.find((item) => item.id === batch.sku_id)?.sku ?? batch.sku_id.slice(0, 8)}</td><td>{batch.supplier_name}</td><td>{batch.supplier_ref || '—'}</td><td>{batch.quantity}</td><td>KSh {Number(batch.unit_cost_kes).toLocaleString()}</td></tr>)}{!batches.length && <tr><td colSpan={6} className="empty-table">No supplier batches yet.</td></tr>}</tbody></table></div>
          </section>
          <section className="admin-card admin-wide">
            <div className="admin-card-head"><div><h2>Audit log</h2><p>Recent administrative changes</p></div></div>
            <div className="table-wrap"><table><thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Resource</th></tr></thead><tbody>{audit.map((entry) => <tr key={entry.id}><td><time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time></td><td>{entry.actor_email}</td><td>{displayStatus(entry.action)}</td><td>{entry.resource}</td></tr>)}{!audit.length && <tr><td colSpan={4} className="empty-table">No audit entries yet.</td></tr>}</tbody></table></div>
          </section>
        </div>
      </div>
    </main>
  );
}
