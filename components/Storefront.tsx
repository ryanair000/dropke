'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft, ArrowRight, Check, ChevronDown, Copy, CreditCard, Gamepad2, Globe2,
  Headphones, LockKeyhole, PackageCheck, ShieldCheck, ShoppingBag, Smartphone,
  Sparkles, WalletCards, X, Zap,
} from 'lucide-react';
import { currencySymbol, products as fallbackProducts } from '@/lib/catalog';
import type { Platform, ProductDefinition, PublicCatalog, PublicOrder, Quote, RegionCode, SafeCheckout } from '@/types/dropke';

const CHECKOUT_ENABLED = process.env.NEXT_PUBLIC_CHECKOUT_ENABLED === 'true';
const vBuckIds = ['vb800', 'vb2400', 'vb4500', 'vb12500'];
const packIds = ['pack1', 'pack2', 'pack3'];
const ORDER_CACHE_KEY = 'dropke:orders';

type StoredOrder = { email: string; deliveryToken: string };

function money(value?: number) {
  return typeof value === 'number' && value > 0 ? `KSh ${Math.round(value).toLocaleString()}` : 'Price unavailable';
}

function readStoredOrders(): Record<string, StoredOrder> {
  try {
    const cached = sessionStorage.getItem(ORDER_CACHE_KEY);
    return cached ? JSON.parse(cached) as Record<string, StoredOrder> : {};
  } catch {
    return {};
  }
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? 'Request failed');
  return payload as T;
}

export default function Storefront({ initialCatalog }: { initialCatalog: PublicCatalog | null }) {
  const [platform, setPlatform] = useState<Platform>('PlayStation');
  const [region, setRegion] = useState<RegionCode>('ZA');
  const [catalog, setCatalog] = useState<PublicCatalog | null>(initialCatalog);
  const [catalogStatus, setCatalogStatus] = useState<'loading' | 'ready' | 'error'>(initialCatalog ? 'ready' : 'loading');
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [quote, setQuote] = useState<Quote | null>(null);
  const [customPrice, setCustomPrice] = useState('');
  const [loadingProduct, setLoadingProduct] = useState('');
  const [notice, setNotice] = useState('');
  const [delivered, setDelivered] = useState<PublicOrder | null>(null);
  const [trackRef, setTrackRef] = useState('');
  const [trackContact, setTrackContact] = useState('');
  const [trackToken, setTrackToken] = useState('');
  const [tracked, setTracked] = useState<PublicOrder | null>(null);
  const [tracking, setTracking] = useState(false);

  const availablePlatforms = useMemo(() => Array.from(new Set((catalog?.setups ?? []).map((setup) => setup.platform))), [catalog]);
  const availableRegions = useMemo(() => (catalog?.setups ?? []).filter((setup) => setup.platform === platform), [catalog, platform]);
  const currentSetup = useMemo(() => availableRegions.find((setup) => setup.region === region) ?? availableRegions[0], [availableRegions, region]);
  const catalogProducts = useMemo(() => catalog?.products ?? [], [catalog]);
  const vBuckProducts = useMemo(() => catalogProducts.filter((product) => vBuckIds.includes(product.id)), [catalogProducts]);
  const displayVBucks = vBuckProducts.length ? vBuckProducts : fallbackProducts.filter((product) => vBuckIds.includes(product.id));
  const packProducts = useMemo(() => catalogProducts.filter((product) => packIds.includes(product.id)), [catalogProducts]);
  const crewProduct = catalogProducts.find((product) => product.id === 'crew');
  const regionMeta = {
    name: currentSetup?.regionName ?? 'Select your account region',
    currency: currentSetup?.storeCurrency ?? '',
    symbol: currentSetup ? currencySymbol(currentSetup.storeCurrency) : '',
  };

  const getQuote = useCallback(async (productId: string, price?: number, preview = false) => jsonRequest<Quote>('/api/quote', {
    method: 'POST',
    body: JSON.stringify({ productId, platform, region, customStorePrice: price, preview }),
  }), [platform, region]);

  useEffect(() => {
    if (initialCatalog) return;
    let active = true;
    jsonRequest<PublicCatalog>('/api/catalog').then((next) => {
      if (!active) return;
      setCatalog(next);
      setCatalogStatus('ready');
    }).catch(() => {
      if (!active) return;
      setCatalogStatus('error');
      setNotice('Live prices are temporarily unavailable. No checkout can start until they return.');
    });
    return () => { active = false; };
  }, [initialCatalog]);

  useEffect(() => {
    if (!catalog?.setups.length) return;
    const preferred = catalog.setups.find((setup) => setup.platform === 'PlayStation' && setup.region === 'ZA') ?? catalog.setups[0];
    if (!availablePlatforms.includes(platform)) setPlatform(preferred.platform);
    if (!catalog.setups.some((setup) => setup.platform === platform && setup.region === region)) {
      setRegion((catalog.setups.find((setup) => setup.platform === platform) ?? preferred).region);
    }
  }, [availablePlatforms, catalog, platform, region]);

  useEffect(() => {
    let active = true;
    async function loadPrices() {
      const next: Record<string, Quote> = {};
      const ids = catalogProducts.filter((product) => product.kind !== 'custom').map((product) => product.id);
      await Promise.all(ids.map(async (productId) => {
        try { next[productId] = await getQuote(productId, undefined, true); } catch { /* Keep this product unavailable. */ }
      }));
      if (active) setQuotes(next);
    }
    setQuotes({});
    if (catalogStatus === 'ready' && currentSetup) loadPrices();
    return () => { active = false; };
  }, [catalogProducts, catalogStatus, currentSetup, getQuote]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') !== 'paystack') return;
    const ref = params.get('reference') || params.get('trxref');
    if (!ref) return;
    const checkout = readStoredOrders()[ref];
    if (!checkout) { setNotice(`Payment return received for ${ref}. Use Track order to check its status.`); return; }
    jsonRequest<{ status: string }>(`/api/paystack/verify/${encodeURIComponent(ref)}`)
      .then(() => jsonRequest<PublicOrder>(`/api/orders/${encodeURIComponent(ref)}`, { method: 'POST', body: JSON.stringify({ contact: checkout.email, deliveryToken: checkout.deliveryToken }) }))
      .then((order) => { setDelivered(order); setNotice('Payment confirmed. Your credit is ready.'); window.history.replaceState({}, '', window.location.pathname); })
      .catch((error: Error) => setNotice(error.message));
  }, []);

  async function openProduct(productId: string) {
    setLoadingProduct(productId); setNotice('');
    try { setQuote(await getQuote(productId)); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not match credit.'); }
    finally { setLoadingProduct(''); }
  }

  async function matchCustom() {
    const value = Number(customPrice);
    if (!Number.isFinite(value) || value <= 0) { setNotice('Enter the price shown in your Fortnite store first.'); return; }
    setLoadingProduct('custom'); setNotice('');
    try { setQuote(await getQuote('custom', value)); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not match credit.'); }
    finally { setLoadingProduct(''); }
  }

  async function trackOrder(event: React.FormEvent) {
    event.preventDefault(); setTracking(true); setNotice(''); setTracked(null);
    try {
      setTracked(await jsonRequest<PublicOrder>(`/api/orders/${encodeURIComponent(trackRef.trim())}`, { method: 'POST', body: JSON.stringify({ contact: trackContact.trim(), deliveryToken: trackToken.trim() || undefined }) }));
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not find that order.'); }
    finally { setTracking(false); }
  }

  return (
    <main className="storefront">
      <div className="announcement-bar"><span><Zap size={13} /> Digital delivery</span><span><CreditCard size={13} /> Pay in KSh</span><span><ShieldCheck size={13} /> No gaming password</span></div>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="DROPKE home"><span className="brand-mark">D</span>DROP<span>KE</span></a>
        <nav aria-label="Primary navigation"><a href="#shop">Shop</a><a href="#how">How it works</a><a href="#trust">Safety</a><a href="#faq">Help</a></nav>
        <a className="header-track" href="#track"><PackageCheck size={16} /> Track order</a>
      </header>

      <section id="top" className="hero-redesign">
        <div className="hero-copy"><div className="hero-kicker"><span className="live-dot" /> Built for Kenyan players</div><h1>V-Bucks without the <span>guesswork.</span></h1><p className="hero-lead">Choose your Fortnite purchase. We match the right wallet credit for your platform and account region, then you redeem it yourself.</p><div className="hero-actions"><a className="button button-primary" href="#shop">Find my top-up <ArrowRight size={17} /></a><a className="button button-ghost" href="#how">See how it works</a></div><div className="hero-proof" aria-label="Purchase benefits"><span><Check /> Region checked</span><span><Check /> Secure Paystack checkout</span><span><Check /> You keep control</span></div></div>
        <div className="hero-visual" aria-label="Example digital wallet credit"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="credit-card-visual"><div className="credit-card-top"><span>DIGITAL WALLET CREDIT</span><Gamepad2 /></div><div className="credit-coin"><span>V</span></div><div className="credit-amount"><strong>2,400</strong><span>V-BUCKS</span></div><div className="credit-card-bottom"><span>PLAYSTATION</span><span>REGION MATCHED</span></div></div><div className="floating-note pay-note"><WalletCards /><span><small>CHECKOUT IN</small><strong>Kenyan shillings</strong></span></div><div className="floating-note safe-note-visual"><LockKeyhole /><span><small>ACCOUNT SAFE</small><strong>No password needed</strong></span></div></div>
      </section>

      <section className="setup-panel" aria-labelledby="setup-title"><div className="setup-intro"><span className="step-number">01</span><div><p className="section-kicker">YOUR GAMING SETUP</p><h2 id="setup-title">Match the correct store region</h2></div></div><label className="select-field"><span>Platform</span><div><Gamepad2 /><select value={platform} disabled={!availablePlatforms.length} onChange={(event) => setPlatform(event.target.value as Platform)}>{availablePlatforms.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown /></div></label><label className="select-field"><span>Account region</span><div><Globe2 /><select value={region} disabled={!availableRegions.length} onChange={(event) => setRegion(event.target.value as RegionCode)}>{availableRegions.map((item) => <option key={item.region} value={item.region}>{item.regionName}</option>)}</select><ChevronDown /></div></label><a className="setup-help" href="#region-help">How do I check?</a></section>

      {notice && <div className="page-notice" role="status" aria-live="polite"><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="Dismiss notice"><X /></button></div>}

      <section id="shop" className="content-section shop-section"><div className="section-title-row"><div><p className="section-kicker">POPULAR TOP-UPS</p><h2>Pick your V-Bucks</h2><p>Live KSh pricing for your selected platform and account region.</p></div><div className="selection-pill"><Gamepad2 /> {platform}<span />{regionMeta.name}</div></div><div className="product-grid">{displayVBucks.map((product) => <ProductCard key={product.id} product={product} quote={quotes[product.id]} platform={platform} regionName={regionMeta.name} popular={product.id === 'vb2400'} catalogReady={catalogStatus === 'ready'} busy={loadingProduct === product.id} onSelect={() => openProduct(product.id)} />)}</div></section>

      <section className="content-section match-section">
        <article className="custom-matcher"><div className="matcher-icon"><Sparkles /></div><p className="section-kicker light">BUYING SOMETHING ELSE?</p><h2>Match any Fortnite store price.</h2><p>Enter the exact price shown on your account. We will find the lowest-cost wallet credit combination that covers it.</p><label className="price-field"><span>{regionMeta.currency || 'Store'} price</span><div><b>{regionMeta.symbol || '—'}</b><input inputMode="decimal" value={customPrice} onChange={(event) => setCustomPrice(event.target.value)} placeholder="0.00" aria-label="Fortnite store price" /></div></label><button className="button button-light" type="button" disabled={catalogStatus !== 'ready' || loadingProduct === 'custom'} onClick={matchCustom}>{loadingProduct === 'custom' ? 'Matching…' : 'Match my credit'} <ArrowRight /></button></article>
        <article className="control-card" id="trust"><div className="control-visual"><ShieldCheck /></div><p className="section-kicker">YOUR ACCOUNT STAYS YOURS</p><h2>Credit delivered. Control retained.</h2><p>We never ask for your Epic, PlayStation, Xbox, Nintendo, or PC password. You receive the code and redeem it on your account.</p><ul><li><Check /> Account region confirmed before payment</li><li><Check /> Redeemable codes encrypted at rest</li><li><Check /> Delivered order protected by a private token</li></ul></article>
      </section>

      {crewProduct && <section id="crew" className="content-section crew-banner"><div><p className="section-kicker light">FORTNITE CREW</p><h2>Monthly Crew. No account handover.</h2><p>Receive the matched wallet credit, redeem it, and subscribe from your own account.</p></div><div><strong>{money(quotes.crew?.kesPrice)}</strong><button className="button button-light" disabled={!quotes.crew || quotes.crew.soldOut} onClick={() => openProduct('crew')}>View Crew match</button></div></section>}

      {packProducts.length > 0 && <section id="packs" className="content-section"><div className="section-title-row compact"><div><p className="section-kicker">FORTNITE PACKS</p><h2>Pack-ready credit</h2></div></div><div className="pack-grid">{packProducts.map((product, index) => { const current = quotes[product.id]; return <article className="pack-card" key={product.id}><div className={`pack-art pack-art-${index + 1}`}><ShoppingBag /><span>DIGITAL PACK CREDIT</span></div><div><h3>{product.name}</h3><p>{product.description}</p><div className="pack-action"><strong>{money(current?.kesPrice)}</strong><button disabled={!current || current.soldOut} onClick={() => openProduct(product.id)}>View match <ArrowRight /></button></div></div></article>; })}</div></section>}

      <section id="how" className="how-band"><div className="content-section"><div className="section-title-row light"><div><p className="section-kicker light">FROM TOP-UP TO DROP-IN</p><h2>Four steps. No account sharing.</h2></div></div><div className="steps-grid"><article><span>01</span><Smartphone /><h3>Choose</h3><p>Select the purchase, platform, and account region.</p></article><article><span>02</span><CreditCard /><h3>Pay</h3><p>Complete secure KSh checkout through Paystack.</p></article><article><span>03</span><PackageCheck /><h3>Receive</h3><p>Get the matched wallet-credit code digitally.</p></article><article><span>04</span><Gamepad2 /><h3>Redeem</h3><p>Add the credit to your account and drop in.</p></article></div></div></section>

      <section id="track" className="content-section track-card"><div className="track-copy"><div className="track-icon"><PackageCheck /></div><p className="section-kicker">ORDER STATUS</p><h2>Track your DROPKE order</h2><p>Use the reference and checkout contact. Add your private delivery token when you need to reveal a fulfilled code.</p><div className="support-line"><Headphones /> Need help? Keep your order reference ready.</div></div><form onSubmit={trackOrder}><label><span>Order reference</span><input value={trackRef} onChange={(event) => setTrackRef(event.target.value)} placeholder="DRP-…" autoComplete="off" required /></label><label><span>Checkout email or phone</span><input value={trackContact} onChange={(event) => setTrackContact(event.target.value)} placeholder="you@example.com" autoComplete="email" required /></label><label><span>Delivery token <small>Only needed to reveal codes</small></span><input value={trackToken} onChange={(event) => setTrackToken(event.target.value)} placeholder="Paste your private token" autoComplete="off" /></label><button className="button button-dark" disabled={tracking}>{tracking ? 'Checking…' : 'Track order'} <ArrowRight /></button></form>{tracked && <OrderResult order={tracked} />}</section>

      <section id="faq" className="content-section faq-section"><div><p className="section-kicker">GOOD TO KNOW</p><h2>Before you buy</h2><p>Wallet credit is tied to your gaming platform and account region. Check both before payment.</p></div><div className="faq-list"><details id="region-help"><summary>How do I check my account region?<span>+</span></summary><p>Open your platform account settings and confirm the store or country region attached to the account. Use that region here, even when it differs from your physical location.</p></details><details><summary>Do you need my gaming password?<span>+</span></summary><p>No. DROPKE supplies wallet credit. You redeem it yourself, so your gaming login remains private.</p></details><details><summary>How is my credit selected?<span>+</span></summary><p>The matcher finds the lowest-cost available wallet-credit combination that covers the selected store price and shows the expected wallet balance.</p></details><details><summary>Where is my delivery token?<span>+</span></summary><p>It is saved in the browser session that created your order and used automatically after Paystack returns. Keep it private because it unlocks fulfilled code delivery.</p></details></div></section>

      <footer className="site-footer"><div className="footer-brand"><a className="brand" href="#top"><span className="brand-mark">D</span>DROP<span>KE</span></a><p>Fortnite wallet credit matched for Kenyan gamers.</p></div><div><strong>Shop</strong><a href="#shop">V-Bucks</a><a href="#crew">Crew</a><a href="#packs">Packs</a></div><div><strong>Support</strong><a href="#track">Track order</a><a href="#faq">Help & FAQ</a></div><div><strong>Safety</strong><span>Never share your gaming password.</span><span>Independent retailer. Not affiliated with Epic Games.</span></div></footer>
      {quote && <CheckoutModal quote={quote} onClose={() => setQuote(null)} />}
      {delivered && <DeliveryModal order={delivered} onClose={() => setDelivered(null)} />}
    </main>
  );
}

function ProductCard({ product, quote, platform, regionName, popular, catalogReady, busy, onSelect }: { product: ProductDefinition; quote?: Quote; platform: Platform; regionName: string; popular: boolean; catalogReady: boolean; busy: boolean; onSelect: () => void }) {
  const disabled = !catalogReady || !quote || quote.soldOut || busy;
  return <article className={`product-card ${popular ? 'popular' : ''}`}><div className="product-card-top"><span className="product-icon"><span>V</span></span>{popular && <span className="popular-tag">MOST POPULAR</span>}</div><div className="product-amount"><strong>{product.shortName}</strong><span>V-BUCKS</span></div><p>{product.description}</p><div className="product-meta"><span><Gamepad2 /> {platform}</span><span><Globe2 /> {regionName}</span></div><div className="product-price"><small>YOUR PRICE</small><strong>{quote ? money(quote.kesPrice) : catalogReady ? 'Checking…' : 'Unavailable'}</strong></div><button type="button" disabled={disabled} onClick={onSelect}>{busy ? 'Matching…' : quote?.soldOut ? 'Sold out' : quote ? 'Choose top-up' : catalogReady ? 'Checking stock…' : 'Live pricing offline'} <ArrowRight /></button></article>;
}

function DialogShell({ children, titleId, onClose, className = '' }: { children: ReactNode; titleId: string; onClose: () => void; className?: string }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>('button, input, [href], select, textarea')?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [href], select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'));
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', handleKey); document.body.classList.add('modal-open');
    return () => { document.removeEventListener('keydown', handleKey); document.body.classList.remove('modal-open'); previous?.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div ref={dialogRef} className={`modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>{children}<button className="modal-close" type="button" onClick={onClose} aria-label="Close dialog"><X /></button></div></div>;
}

function CheckoutModal({ quote, onClose }: { quote: Quote; onClose: () => void }) {
  const [confirmed, setConfirmed] = useState(false); const [email, setEmail] = useState(''); const [phone, setPhone] = useState('');
  const [step, setStep] = useState<'review' | 'details' | 'pending'>('review'); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [orderRef, setOrderRef] = useState('');
  function startCheckout() { if (!confirmed) { setError('Confirm your account region first.'); return; } setError(''); setStep('details'); }
  async function pay() {
    if (!CHECKOUT_ENABLED) { setError('Payments are not open yet.'); return; }
    if (!quote.quoteId) { setError('This quote is no longer current. Close checkout and refresh the price.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phone.replace(/\D/g, '').length < 9) { setError('Enter a valid email and phone number.'); return; }
    setBusy(true); setError('');
    try {
      const order = await jsonRequest<{ ref: string; deliveryToken: string; quote: SafeCheckout }>('/api/orders', { method: 'POST', body: JSON.stringify({ quoteId: quote.quoteId, email, phone }) });
      setOrderRef(order.ref); const orders = readStoredOrders(); orders[order.ref] = { email: email.trim().toLowerCase(), deliveryToken: order.deliveryToken }; sessionStorage.setItem(ORDER_CACHE_KEY, JSON.stringify(orders));
      const payment = await jsonRequest<{ authorizationUrl: string }>('/api/paystack/initialize', { method: 'POST', body: JSON.stringify({ orderRef: order.ref }) }); window.location.assign(payment.authorizationUrl);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not start checkout.'); setStep('pending'); }
    finally { setBusy(false); }
  }
  return <DialogShell titleId="checkout-title" onClose={onClose}><div className="checkout-steps" aria-label="Checkout progress"><span className="active">1</span><i /><span className={step !== 'review' ? 'active' : ''}>2</span><i /><span className={step === 'pending' ? 'active' : ''}>3</span></div>{step === 'review' && <><p className="section-kicker">CREDIT MATCH</p><h2 id="checkout-title">{quote.productName}</h2><p className="modal-lead">Matched for {quote.platform} · {quote.regionName}</p><div className="review-total"><span>Total</span><strong>{money(quote.kesPrice)}</strong></div><div className="match-box"><div><span>Fortnite price</span><strong>{quote.currencySymbol}{quote.storePrice}</strong></div><div><span>Credit supplied</span><strong>{quote.currencySymbol}{quote.matchedCredit}</strong></div><div><span>Wallet left over</span><strong>{quote.currencySymbol}{quote.balanceRemaining}</strong></div><small>{quote.cardBreakdown.join(' + ')} wallet credit</small></div><div className="modal-safety"><LockKeyhole /><span><strong>Your login stays private.</strong>You receive credit and redeem it yourself.</span></div><label className="confirm-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>My {quote.platform} account region is <strong>{quote.regionName}</strong>.</span></label><button className="button button-primary full" disabled={quote.soldOut} onClick={startCheckout}>{quote.soldOut ? 'Out of stock' : 'Continue securely'} <ArrowRight /></button></>}{step === 'details' && <><button className="modal-back" type="button" onClick={() => setStep('review')}><ArrowLeft /> Back to match</button><p className="section-kicker">DELIVERY DETAILS</p><h2 id="checkout-title">Where should we link your order?</h2><p className="modal-lead">Paystack handles payment. We use these details for receipt and order recovery.</p><label className="field"><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label><label className="field"><span>Phone</span><input type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="07XX XXX XXX" /></label><div className="checkout-total"><span>Secure checkout total</span><strong>{money(quote.kesPrice)}</strong></div><button className="button button-primary full" disabled={busy || !CHECKOUT_ENABLED} onClick={pay}>{busy ? 'Starting checkout…' : CHECKOUT_ENABLED ? 'Continue to Paystack' : 'Payments opening soon'} <ArrowRight /></button></>}{step === 'pending' && <><p className="section-kicker">CHECKOUT PAUSED</p><h2 id="checkout-title">{orderRef || 'We could not continue'}</h2><p className="modal-lead">You have not been charged unless Paystack confirmed the payment. Keep the order reference and try tracking it before starting again.</p><a className="button button-dark full" href="#track" onClick={onClose}>Track this order</a></>}{error && <div className="modal-error" role="alert">{error}</div>}</DialogShell>;
}

function OrderResult({ order }: { order: PublicOrder }) {
  return <div className="order-result" aria-live="polite"><div><span>Order</span><strong>{order.ref}</strong></div><div><span>Payment</span><strong className={`status status-${order.paymentStatus}`}>{order.paymentStatus}</strong></div><div><span>Delivery</span><strong className={`status status-${order.status}`}>{order.status.replaceAll('_', ' ')}</strong></div>{order.codes?.length ? <div className="delivered-codes">{order.codes.map((code) => <CodeBox code={code} key={code} />)}</div> : <p>Codes appear here after verified payment and fulfilment.</p>}</div>;
}

function DeliveryModal({ order, onClose }: { order: PublicOrder; onClose: () => void }) {
  return <DialogShell titleId="delivery-title" onClose={onClose} className="success-modal"><div className="success-icon"><Check /></div><p className="section-kicker">CREDIT DELIVERED</p><h2 id="delivery-title">Your code is ready.</h2><p className="modal-lead">Order {order.ref} · {order.platform} · {order.regionName}</p><div className="delivered-codes">{order.codes?.map((code) => <CodeBox code={code} key={code} />)}</div><ol><li>Redeem the wallet code on your {order.platform} account.</li><li>Launch Fortnite.</li><li>Buy the selected content from your wallet balance.</li></ol><button className="button button-primary full" onClick={onClose}>Done</button></DialogShell>;
}

function CodeBox({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return <div className="code-box"><code>{code}</code><button type="button" aria-label={copied ? 'Code copied' : 'Copy delivery code'} onClick={async () => { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1400); }}>{copied ? <Check /> : <Copy />}</button></div>;
}
