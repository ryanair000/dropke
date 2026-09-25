'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Copy, CreditCard, LockKeyhole, PackageCheck, ShieldCheck, Smartphone, X } from 'lucide-react';
import { currencySymbol } from '@/lib/catalog';
import type { Platform, PublicCatalog, PublicOrder, Quote, RegionCode, SafeCheckout } from '@/types/dropke';

const CHECKOUT_ENABLED = process.env.NEXT_PUBLIC_CHECKOUT_ENABLED === 'true';
const vBuckIds = ['vb800', 'vb2400', 'vb4500', 'vb12500'];
const packIds = ['pack1', 'pack2', 'pack3'];

function money(value?: number) {
  return typeof value === 'number' && value > 0 ? `KSh ${Math.round(value).toLocaleString()}` : 'Check price';
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? 'Request failed');
  return payload as T;
}

export default function Storefront() {
  const [platform, setPlatform] = useState<Platform>('PlayStation');
  const [region, setRegion] = useState<RegionCode>('ZA');
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [quote, setQuote] = useState<Quote | null>(null);
  const [customPrice, setCustomPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [delivered, setDelivered] = useState<PublicOrder | null>(null);
  const [trackRef, setTrackRef] = useState('');
  const [trackContact, setTrackContact] = useState('');
  const [trackToken, setTrackToken] = useState('');
  const [tracked, setTracked] = useState<PublicOrder | null>(null);

  const availablePlatforms = useMemo(
    () => Array.from(new Set((catalog?.setups ?? []).map((setup) => setup.platform))),
    [catalog],
  );
  const availableRegions = useMemo(
    () => (catalog?.setups ?? []).filter((setup) => setup.platform === platform),
    [catalog, platform],
  );
  const currentSetup = useMemo(
    () => availableRegions.find((setup) => setup.region === region) ?? availableRegions[0],
    [availableRegions, region],
  );
  const catalogProducts = useMemo(() => catalog?.products ?? [], [catalog]);
  const vBuckProducts = useMemo(
    () => catalogProducts.filter((product) => vBuckIds.includes(product.id)),
    [catalogProducts],
  );
  const packProducts = useMemo(
    () => catalogProducts.filter((product) => packIds.includes(product.id)),
    [catalogProducts],
  );
  const crewProduct = catalogProducts.find((product) => product.id === 'crew');
  const regionMeta = {
    name: currentSetup?.regionName ?? region,
    currency: currentSetup?.storeCurrency ?? '',
    symbol: currencySymbol(currentSetup?.storeCurrency ?? ''),
  };

  const getQuote = useCallback(async (productId: string, price?: number, preview = false) => {
    return jsonRequest<Quote>('/api/quote', {
      method: 'POST',
      body: JSON.stringify({ productId, platform, region, customStorePrice: price, preview }),
    });
  }, [platform, region]);

  useEffect(() => {
    let active = true;
    jsonRequest<PublicCatalog>('/api/catalog')
      .then((next) => {
        if (!active) return;
        setCatalog(next);
        const preferred = next.setups.find((setup) => setup.platform === 'PlayStation' && setup.region === 'ZA')
          ?? next.setups[0];
        if (preferred) {
          setPlatform(preferred.platform);
          setRegion(preferred.region);
        }
      })
      .catch(() => active && setNotice('The storefront catalog is temporarily unavailable.'));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (availableRegions.length && !availableRegions.some((setup) => setup.region === region)) {
      setRegion(availableRegions[0].region);
    }
  }, [availableRegions, region]);

  useEffect(() => {
    let active = true;
    async function load() {
      const next: Record<string, Quote> = {};
      const ids = catalogProducts.filter((product) => product.kind !== 'custom').map((product) => product.id);
      await Promise.all(ids.map(async (productId) => {
        try {
          next[productId] = await getQuote(productId, undefined, true);
        } catch {
          // Prices stay unavailable until the backend is configured.
        }
      }));
      if (active) setQuotes(next);
    }
    if (catalog && currentSetup) load();
    return () => { active = false; };
  }, [catalog, catalogProducts, currentSetup, getQuote]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') !== 'paystack') return;
    const ref = params.get('reference') || params.get('trxref');
    if (!ref) return;
    const cached = sessionStorage.getItem('dropke:orders');
    if (!cached) {
      setNotice(`Payment return received for ${ref}. Use Track Order to check its status.`);
      return;
    }
    try {
      const orders = JSON.parse(cached) as Record<string, { email: string; deliveryToken: string }>;
      const checkout = orders[ref];
      if (!checkout) {
        setNotice(`Payment return received for ${ref}. Use Track Order to check its status.`);
        return;
      }
      jsonRequest<{ status: string }>(`/api/paystack/verify/${encodeURIComponent(ref)}`)
        .then(() => jsonRequest<PublicOrder>(`/api/orders/${encodeURIComponent(ref)}`, {
          method: 'POST',
          body: JSON.stringify({ contact: checkout.email, deliveryToken: checkout.deliveryToken }),
        }))
        .then((order) => {
          setDelivered(order);
          setNotice('Payment confirmed. Your DROPKE credit is ready.');
          window.history.replaceState({}, '', window.location.pathname);
        })
        .catch((error: Error) => setNotice(error.message));
    } catch {
      // Ignore stale browser state.
    }
  }, []);

  async function openProduct(productId: string) {
    setLoading(true);
    setNotice('');
    try {
      setQuote(await getQuote(productId));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not match credit.');
    } finally {
      setLoading(false);
    }
  }

  async function matchCustom() {
    const value = Number(customPrice);
    if (!Number.isFinite(value) || value <= 0) {
      setNotice('Enter the Fortnite store price first.');
      return;
    }
    setLoading(true);
    try {
      setQuote(await getQuote('custom', value));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not match credit.');
    } finally {
      setLoading(false);
    }
  }

  async function trackOrder(event: React.FormEvent) {
    event.preventDefault();
    setNotice('');
    setTracked(null);
    try {
      setTracked(await jsonRequest<PublicOrder>(`/api/orders/${encodeURIComponent(trackRef.trim())}`, {
        method: 'POST',
        body: JSON.stringify({ contact: trackContact.trim(), deliveryToken: trackToken.trim() || undefined }),
      }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Order not found.');
    }
  }

  return (
    <main>
      <div className="utility-bar"><span>M-Pesa via Paystack</span><span>Digital delivery</span><span>No password required</span><span>Kenya support</span></div>
      <header className="nav-shell">
        <a className="brand" href="#top">DROP<span>KE</span></a>
        <nav><a href="#vbucks">V-Bucks</a><a href="#crew">Crew</a><a href="#packs">Packs</a><a href="#how">How it works</a><a href="#track">Track Order</a></nav>
        <a className="nav-cta" href="#vbucks">Shop</a>
      </header>

      <section id="top" className="hero">
        <div className="hero-copy">
          <p className="eyebrow">FORTNITE TOP-UP STORE FOR KENYAN GAMERS</p>
          <h1>GET YOUR <span>V-BUCKS.</span></h1>
          <h2>Pay in KSh. Play on your account.</h2>
          <p className="hero-body">Choose what you want in Fortnite. DROPKE matches the wallet credit for your platform and account region. You redeem it yourself.</p>
          <div className="hero-actions"><a className="primary-button" href="#vbucks">SHOP V-BUCKS</a><a className="secondary-button" href="#how">HOW IT WORKS</a></div>
        <div className="platform-line">{availablePlatforms.length ? availablePlatforms.join(' · ') : 'Loading supported platforms…'}</div>
        </div>
        <div className="hero-stack" aria-label="V-Bucks denominations">
          {vBuckProducts.map((product, index) => <div className="hero-chip" key={product.id} style={{ transform: `translateX(${index * 8}px)` }}><span>{product.shortName}</span><small>V-BUCKS</small></div>)}
        </div>
      </section>

      <section className="setup-shell">
        <div><span className="setup-label">YOUR SETUP</span><strong>Prices and credit adapt to your account.</strong></div>
        <label><span>Platform</span><select value={platform} disabled={!availablePlatforms.length} onChange={(event) => setPlatform(event.target.value as Platform)}>{availablePlatforms.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={15} /></label>
        <label><span>Account region</span><select value={region} disabled={!availableRegions.length} onChange={(event) => setRegion(event.target.value as RegionCode)}>{availableRegions.map((item) => <option key={item.region} value={item.region}>{item.regionName}</option>)}</select><ChevronDown size={15} /></label>
        <a href="#faq">How do I check my region?</a>
      </section>

      {notice && <div className="page-notice">{notice}</div>}

      <section id="vbucks" className="section-shell">
        <div className="section-heading"><div><p className="eyebrow dark">V-BUCKS</p><h2>Choose your top-up</h2></div><p>Matched for {platform} · {regionMeta.name}</p></div>
        <div className="product-grid">
          {vBuckProducts.map((product) => {
            const current = quotes[product.id];
            return <article className={`product-card ${product.id === 'vb2400' ? 'popular' : ''}`} key={product.id}>{product.id === 'vb2400' && <span className="popular-tag">MOST POPULAR</span>}<div className="coin-mark">V</div><h3>{product.shortName}</h3><span>V-BUCKS</span><p>{product.description}</p><strong>{money(current?.kesPrice)}</strong><small>{platform} · {regionMeta.name}</small><button disabled={loading || !current || current.soldOut} onClick={() => openProduct(product.id)}>{current?.soldOut ? 'SOLD OUT' : current ? 'BUY NOW' : 'UNAVAILABLE'}</button></article>;
          })}
        </div>
      </section>

      <section className="split-feature section-shell">
        <article className="custom-card"><p className="eyebrow dark">OTHER FORTNITE PURCHASE</p><h2>Buying a skin, pack or something else?</h2><p>Enter the price shown in your Fortnite store and DROPKE will find the wallet credit that covers it.</p><label><span>{regionMeta.currency} store price</span><div><b>{regionMeta.symbol}</b><input inputMode="decimal" value={customPrice} onChange={(event) => setCustomPrice(event.target.value)} placeholder="0.00" /></div></label><button className="primary-button" onClick={matchCustom}>FIND MY CREDIT</button></article>
        {crewProduct && <article id="crew" className="crew-card"><p className="eyebrow">FORTNITE CREW</p><h2>Monthly Crew, without sharing your password.</h2><p>We match the credit you need. You redeem the wallet code and subscribe from your own account.</p><strong>{money(quotes.crew?.kesPrice)}</strong><button disabled={!quotes.crew || quotes.crew.soldOut} onClick={() => openProduct('crew')}>VIEW CREW</button></article>}
      </section>

      <section id="packs" className="section-shell">
        <div className="section-heading"><div><p className="eyebrow dark">FORTNITE PACKS</p><h2>Pack-ready credit</h2></div><p>No account handover. Ever.</p></div>
        <div className="pack-grid">{packProducts.map((product, index) => {
          const current = quotes[product.id];
          return <article className="pack-card" key={product.id}><div className={`pack-art art-${index + 1}`}><span>FORTNITE</span></div><div><h3>{product.name}</h3><p>{product.description}</p><strong>{money(current?.kesPrice)}</strong><button disabled={!current || current.soldOut} onClick={() => openProduct(product.id)}>VIEW MATCH</button></div></article>;
        })}</div>
      </section>

      <section id="how" className="how-section section-shell">
        <div className="section-heading"><div><p className="eyebrow dark">HOW IT WORKS</p><h2>Four clean steps</h2></div></div>
        <div className="steps-grid"><article><span>01</span><Smartphone /><h3>Choose</h3><p>Pick the Fortnite purchase, platform and account region.</p></article><article><span>02</span><CreditCard /><h3>Pay</h3><p>Pay in KSh through Paystack when checkout is enabled.</p></article><article><span>03</span><PackageCheck /><h3>Receive</h3><p>Your matched wallet-credit code is delivered digitally.</p></article><article><span>04</span><ShieldCheck /><h3>Redeem</h3><p>You redeem it on your own account. Your password stays yours.</p></article></div>
      </section>

      <section className="trust-section section-shell"><div><LockKeyhole size={30} /><p className="eyebrow dark">ACCOUNT SAFETY</p><h2>Your account stays yours.</h2><p>DROPKE never needs your PlayStation, Xbox, Nintendo or Epic password. We supply credit. You redeem it.</p></div><div className="trust-list"><span><Check /> Region checked before payment</span><span><Check /> Customer redeems the code</span><span><Check /> Real codes encrypted at rest</span><span><Check /> Order tracking requires matching contact</span></div></section>

      <section id="track" className="track-section section-shell"><div><p className="eyebrow dark">TRACK ORDER</p><h2>Find your DROPKE order</h2><p>Use the order reference plus the same email or phone used at checkout. Add the private delivery token to reveal fulfilled codes.</p></div><form onSubmit={trackOrder}><input value={trackRef} onChange={(event) => setTrackRef(event.target.value)} placeholder="DRP-XXXXXXXXXXXX" required /><input value={trackContact} onChange={(event) => setTrackContact(event.target.value)} placeholder="Checkout email or phone" required /><input value={trackToken} onChange={(event) => setTrackToken(event.target.value)} placeholder="Delivery token (optional)" /><button>TRACK ORDER</button></form>{tracked && <OrderResult order={tracked} />}</section>

      <section id="faq" className="faq section-shell"><div className="section-heading"><div><p className="eyebrow dark">FAQ</p><h2>Before you buy</h2></div></div><details><summary>Why does account region matter?</summary><p>Wallet codes are tied to a platform store and region. Choose the region set on your gaming account, not simply your physical location.</p></details><details><summary>Do you need my gaming password?</summary><p>No. DROPKE never asks for your gaming account password. You redeem the wallet credit yourself.</p></details><details><summary>How is my credit selected?</summary><p>The matcher finds the smallest supported wallet-credit combination that covers the selected Fortnite store price, then shows the expected balance left over.</p></details></section>

      <footer><div><a className="brand" href="#top">DROP<span>KE</span></a><p>Top up. Drop in.</p></div><div><strong>Shop</strong><a href="#vbucks">V-Bucks</a><a href="#crew">Crew</a><a href="#packs">Packs</a></div><div><strong>Support</strong><a href="#track">Track Order</a><a href="#faq">FAQ</a></div><div><strong>Legal</strong><span>Independent retailer. Not affiliated with Epic Games.</span></div></footer>

      {quote && <CheckoutModal quote={quote} onClose={() => setQuote(null)} />}
      {delivered && <DeliveryModal order={delivered} onClose={() => setDelivered(null)} />}
    </main>
  );
}

function CheckoutModal({ quote, onClose }: { quote: Quote; onClose: () => void }) {
  const [confirmed, setConfirmed] = useState(false);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<'review' | 'details' | 'pending'>('review');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [orderRef, setOrderRef] = useState('');

  async function startCheckout() {
    if (!confirmed) { setError('Confirm your account region first.'); return; }
    setStep('details');
  }

  async function pay() {
    if (!CHECKOUT_ENABLED) { setError('Payments are intentionally disabled while DROPKE completes payment setup.'); return; }
    if (!quote.quoteId) { setError('This quote is no longer current. Close checkout and refresh the price.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phone.replace(/\D/g, '').length < 9) { setError('Enter a valid email and phone number.'); return; }
    setBusy(true); setError('');
    try {
      const order = await jsonRequest<{ ref: string; deliveryToken: string; quote: SafeCheckout }>('/api/orders', { method: 'POST', body: JSON.stringify({ quoteId: quote.quoteId, email, phone }) });
      setOrderRef(order.ref);
      const cached = sessionStorage.getItem('dropke:orders');
      const orders = cached ? JSON.parse(cached) as Record<string, { email: string; deliveryToken: string }> : {};
      orders[order.ref] = { email: email.trim().toLowerCase(), deliveryToken: order.deliveryToken };
      sessionStorage.setItem('dropke:orders', JSON.stringify(orders));
      const payment = await jsonRequest<{ authorizationUrl: string }>('/api/paystack/initialize', { method: 'POST', body: JSON.stringify({ orderRef: order.ref }) });
      window.location.assign(payment.authorizationUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not start checkout.');
      setStep('pending');
    } finally { setBusy(false); }
  }

  return <div className="modal-backdrop"><div className="modal"><button className="modal-close" onClick={onClose}><X /></button>{step === 'review' && <><p className="eyebrow dark">CREDIT MATCH</p><h2>{quote.productName}</h2><div className="review-price">{money(quote.kesPrice)}</div><div className="match-box"><strong>Recommended credit</strong><b>{quote.creditLabel}</b><span>Fortnite price: {quote.currencySymbol}{quote.storePrice}</span><span>Credit supplied: {quote.currencySymbol}{quote.matchedCredit}</span><span>Expected wallet balance: {quote.currencySymbol}{quote.balanceRemaining}</span><small>{quote.cardBreakdown.join(' + ')}</small></div><div className="safe-note"><LockKeyhole size={18} /><span>Your account stays yours. We send the credit. You redeem it.</span></div><label className="confirm-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>My {quote.platform} account region is {quote.regionName}.</span></label><button className="primary-button full" disabled={quote.soldOut} onClick={startCheckout}>{quote.soldOut ? 'OUT OF STOCK' : 'CONTINUE'}</button></>}{step === 'details' && <><p className="eyebrow dark">CHECKOUT</p><h2>Pay with Paystack</h2><p className="modal-muted">M-Pesa/mobile money and card methods appear according to your Paystack account settings.</p><label className="field"><span>Email</span><input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label><label className="field"><span>Phone</span><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="07XXXXXXXX" /></label><div className="checkout-total"><span>Total</span><strong>{money(quote.kesPrice)}</strong></div><button className="primary-button full" disabled={busy || !CHECKOUT_ENABLED} onClick={pay}>{busy ? 'STARTING…' : CHECKOUT_ENABLED ? 'CONTINUE TO PAYSTACK' : 'PAYMENTS COMING SOON'}</button></>}{step === 'pending' && <><p className="eyebrow dark">ORDER CREATED</p><h2>{orderRef || 'Checkout paused'}</h2><p className="modal-muted">Your order has not been charged unless Paystack confirmed the payment. If payment setup is still disabled, return later rather than paying twice.</p></>}{error && <div className="modal-error">{error}</div>}</div></div>;
}

function OrderResult({ order }: { order: PublicOrder }) {
  return <div className="order-result"><div><span>Order</span><strong>{order.ref}</strong></div><div><span>Payment</span><strong>{order.paymentStatus}</strong></div><div><span>Delivery</span><strong>{order.status}</strong></div>{order.codes?.length ? <div className="delivered-codes">{order.codes.map((code) => <CodeBox code={code} key={code} />)}</div> : <p>Codes appear here after verified payment and fulfilment.</p>}</div>;
}

function DeliveryModal({ order, onClose }: { order: PublicOrder; onClose: () => void }) {
  return <div className="modal-backdrop"><div className="modal success-modal"><button className="modal-close" onClick={onClose}><X /></button><div className="success-icon"><Check /></div><p className="eyebrow dark">CREDIT DROPPED</p><h2>Your code is ready.</h2><p className="modal-muted">Order {order.ref} · {order.platform} · {order.regionName}</p><div className="delivered-codes">{order.codes?.map((code) => <CodeBox code={code} key={code} />)}</div><ol><li>Redeem the wallet code on your {order.platform} account.</li><li>Launch Fortnite.</li><li>Buy the selected Fortnite content from your wallet balance.</li></ol><button className="primary-button full" onClick={onClose}>DONE</button></div></div>;
}

function CodeBox({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return <div className="code-box"><code>{code}</code><button onClick={async () => { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1400); }}>{copied ? <Check /> : <Copy />}</button></div>;
}
