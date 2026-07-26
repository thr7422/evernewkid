'use strict';

// ================================================================
// ⚙️ 1. SUPABASE CONFIGURATION
// ================================================================
const SUPABASE_URL = 'https://tspwyzqwuqbuetsztxrw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzcHd5enF3dXFidWV0c3p0eHJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1ODI5MzcsImV4cCI6MjEwMDE1ODkzN30.UA828dNNhA1KV5rUiqTRHzvFc41UBu0e-8D4JBzmejs';

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let PRODUCTS = []; // Supabase سے لوڈ ہونے والی بکس کی لسٹ
let visibleCount = 8; // شروع میں کتنی بکس دکھانی ہیں
const limitIncrement = 8; // ہر بار 'View More' دبانے پر مزید کتنی بکس دکھانی ہیں

/* ================================================================
   🔄 SUPABASE DATA LOADER (Direct Database & Storage Integration)
   ================================================================ */
async function loadProductsFromDB() {
  try {
    const { data, error } = await supabase.from('products').select('*');
    
    if (error) {
      console.error("Supabase Error:", error);
      alert("Database Error: " + error.message);
      return;
    }

    if (!data || data.length === 0) {
      console.warn("No products found in database!");
      return;
    }

    // ⚠️ یہاں اپنی Supabase بکیٹ کا اصل نام لکھیں (مثلاً 'products' یا 'images')
    const STORAGE_BUCKET_NAME = 'products'; 

    PRODUCTS = data.map(item => {
      let dbPreviews = item.preview_images;
      let rawPreviews = [];

      if (Array.isArray(dbPreviews)) {
        rawPreviews = dbPreviews;
      } else if (typeof dbPreviews === 'string') {
        try {
          rawPreviews = JSON.parse(dbPreviews);
        } catch (e) {
          let clean = dbPreviews.replace(/^\[|\]$|^\{|\}$/g, '');
          rawPreviews = clean.split(',').map(s => s.replace(/["']/g, '').trim());
        }
      }

      if (!rawPreviews || rawPreviews.length === 0) {
        rawPreviews = [item.image_url];
      }

      let finalPreviews = rawPreviews.map(pathOrUrl => {
        if (!pathOrUrl) return '';
        let cleanPath = pathOrUrl.trim();

        if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
          return cleanPath;
        }

        const { data: publicUrlData } = supabase
          .storage
          .from(STORAGE_BUCKET_NAME)
          .getPublicUrl(cleanPath);

        return publicUrlData.publicUrl;
      });

      let mainImageUrl = item.image_url;
      if (mainImageUrl && !mainImageUrl.startsWith('http')) {
        const { data: mainPub } = supabase.storage
          .from(STORAGE_BUCKET_NAME)
          .getPublicUrl(mainImageUrl.trim());
        mainImageUrl = mainPub.publicUrl;
      }

      return {
        id: item.id,
        name: item.name,
        category: item.category || 'Animals',
        price: parseFloat(item.price || 9.99),
        original: item.original_price ? parseFloat(item.original_price) : 14.99,
        pages: item.pages || 40,
        age: item.age_range || '3-8',
        image: mainImageUrl,
        previewImages: finalPreviews,
        desc: item.description || '',
        badge: item.badge || 'hot',
        rating: item.rating || 4.9,
        reviews: item.reviews || 50
      };
    });

    if (document.body.classList.contains('page-checkout')) {
      new CheckoutPage();
    } else {
      window.EverNewStoreInstance = new EverNewStore();
    }
  } catch (error) {
    console.error("Database loading error:", error);
    if (typeof Toast !== 'undefined') {
      Toast.show("Error loading books from database", "error");
    }
  }
}

/* ================================================================
   CLASS: CartManager — localStorage-backed cart
   ================================================================ */
class CartManager {
  static KEY = 'evernew_cart_v2';

  constructor() { this._items = this._load(); }

  _load() {
    try { return JSON.parse(localStorage.getItem(CartManager.KEY)) || []; }
    catch { return []; }
  }
  _save() { localStorage.setItem(CartManager.KEY, JSON.stringify(this._items)); }

  getItems()    { return [...this._items]; }
  getCount()    { return this._items.reduce((s, i) => s + i.qty, 0); }
  getSubtotal() { return this._items.reduce((s, i) => s + i.product.price * i.qty, 0); }
  has(id)       { return this._items.some(i => i.product.id === id); }

  add(product) {
    const ex = this._items.find(i => i.product.id === product.id);
    if (ex) { ex.qty++; this._save(); return 'incremented'; }
    this._items.push({ product, qty: 1 });
    this._save();
    return 'added';
  }
  setQty(id, qty) {
    if (qty <= 0) { this.remove(id); return; }
    const item = this._items.find(i => i.product.id === id);
    if (item) { item.qty = qty; this._save(); }
  }
  remove(id) { this._items = this._items.filter(i => i.product.id !== id); this._save(); }
  clear()    { this._items = []; this._save(); }
}

/* ================================================================
   CLASS: ProductCatalog
   ================================================================ */
class ProductCatalog {
  constructor(data) {
    this._all      = data;
    this._filtered = [...data];
  }
  getAll()        { return this._all; }
  getFiltered()   { return this._filtered; }
  getById(id)     { return this._all.find(p => p.id === id); }
  getCategories() { return ['All', ...new Set(this._all.map(p => p.category))]; }
  filter(cat) {
    this._filtered = cat === 'All' ? [...this._all] : this._all.filter(p => p.category === cat);
    return this._filtered;
  }
}

/* ================================================================
   CLASS: Toast — notification popups
   ================================================================ */
class Toast {
  static show(msg, type = 'success') {
    const wrap = document.getElementById('toast-container');
    if (!wrap) return;
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<span>${type === 'success' ? '✅' : '❌'}</span> ${msg}`;
    wrap.appendChild(t);
    setTimeout(() => {
      t.classList.add('out');
      t.addEventListener('animationend', () => t.remove(), { once: true });
    }, 3200);
  }
}

/* ================================================================
   CLASS: EverNewStore — main store page controller
   ================================================================ */
class EverNewStore {
  constructor() {
    this._catalog = new ProductCatalog(PRODUCTS);
    this._cart    = new CartManager();
    this._active  = 'All';
    this._init();
  }

  _init() {
    this._renderTabs();
    this._renderProducts(this._catalog.getAll());
    this._updateCounter();
    this._bindEvents();
  }

  _renderTabs() {
    const el = document.getElementById('filter-tabs');
    if (!el) return;
    el.innerHTML = this._catalog.getCategories().map(c => `
      <button class="filter-tab ${c === this._active ? 'active' : ''}" data-cat="${c}">${c}</button>
    `).join('');
  }

  _renderProducts(list) {
    const el = document.getElementById('products-grid');
    if (!el) return;

    if (!list.length) {
      el.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:4rem;color:var(--muted);font-size:1.1rem;">
          😔 No products in this category yet.
        </div>`;
      document.querySelector('.view-more-container')?.classList.add('hidden');
      return;
    }

    const itemsToShow = list.slice(0, visibleCount);
    el.innerHTML = itemsToShow.map(p => this._cardHTML(p)).join('');

    const viewMoreContainer = document.querySelector('.view-more-container');
    if (viewMoreContainer) {
      if (visibleCount >= list.length) {
        viewMoreContainer.classList.add('hidden');
      } else {
        viewMoreContainer.classList.remove('hidden');
      }
    }
  }

  _cardHTML(p) {
    const inCart = this._cart.has(p.id);
    const badge  = p.badge
      ? `<span class="pc-badge ${p.badge}">${p.badge === 'hot' ? '🔥 Hot' : p.badge === 'new' ? '✨ New' : '🏷️ Sale'}</span>`
      : '';
    const orig   = p.original
      ? `<span class="pc-price-old">$${p.original.toFixed(2)}</span>`
      : '';
    const stars  = '⭐'.repeat(Math.round(p.rating || 5));

    const thumbHTML = p.image
      ? `<img
            src="${p.image}"
            alt="${p.name}"
            class="pc-real-img"
            style="cursor: pointer;"
            data-action="preview"
            data-id="${p.id}"
            onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
         />
         <div class="pc-thumb-bg pc-fallback" style="display:none; cursor: pointer;" data-action="preview" data-id="${p.id}">🎨</div>`
      : `<div class="pc-thumb-bg" style="cursor: pointer;" data-action="preview" data-id="${p.id}">🎨</div>`;

    return `
      <article class="product-card" data-id="${p.id}" role="listitem">
        ${badge}
        <button class="pc-wish" data-action="wish" data-id="${p.id}" aria-label="Wishlist ${p.name}">🤍</button>

        <div class="pc-thumb">
          ${thumbHTML}
          <div class="pc-overlay">
            <button class="pc-overlay-btn" data-action="preview" data-id="${p.id}">👁️ Quick Preview</button>
            <button class="pc-overlay-btn" data-action="add" data-id="${p.id}">🛒 Add to Cart</button>
          </div>
        </div>

        <div class="pc-body">
          <div class="pc-cat" style="display:flex; justify-content:space-between; width:100%;">
            <span>${p.category}</span>
            <span style="color:var(--primary); font-weight:800; cursor:pointer;" data-action="preview" data-id="${p.id}">👁️ Preview Inside</span>
          </div>
          <h3 class="pc-name" style="cursor:pointer;" data-action="preview" data-id="${p.id}">${p.name}</h3>
          <p class="pc-desc">${p.desc}</p>

          <div class="pc-meta">
            <div class="pc-rating">
              <span class="pc-stars">${stars}</span> ${p.rating} (${p.reviews})
            </div>
            <div class="pc-pages">📄 ${p.pages} pages</div>
          </div>

          <div class="pc-footer">
            <div class="pc-price">
              <span class="pc-price-now">$${p.price.toFixed(2)}</span>
              ${orig}
            </div>
            <button
              class="btn-add ${inCart ? 'added' : ''}"
              data-action="add"
              data-id="${p.id}"
              aria-label="Add ${p.name} to cart"
              style="display: inline-flex !important; align-items: center !important; gap: 4px !important; background: ${inCart ? 'linear-gradient(135deg, #3ECF8E, #1DB481)' : 'linear-gradient(135deg, #FF5A5F, #FF9A3C)'} !important; color: #ffffff !important; font-family: inherit !important; font-weight: 800 !important; font-size: 0.78rem !important; padding: 7px 16px !important; border-radius: 999px !important; border: none !important; cursor: pointer !important; box-shadow: 0 4px 10px rgba(255,90,95,0.3) !important;"
            >
              ${inCart ? '✓ Added' : '+ Add'}
            </button>
          </div>
        </div>
      </article>`;
  }

  _updateCounter() {
    const el = document.getElementById('cart-count');
    if (!el) return;
    el.textContent = this._cart.getCount();
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
    setTimeout(() => el.classList.remove('bump'), 300);
  }

  _bindEvents() {
    document.getElementById('products-grid')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = parseInt(btn.dataset.id);
      const p  = this._catalog.getById(id);
      if (!p) return;

      if (btn.dataset.action === 'add')  this._addToCart(p);
      if (btn.dataset.action === 'preview') this._openPreview(p);
      if (btn.dataset.action === 'wish') {
        btn.textContent = '❤️';
        Toast.show(`"${p.name}" saved to wishlist!`);
      }
    });

    document.getElementById('filter-tabs')?.addEventListener('click', e => {
      const btn = e.target.closest('.filter-tab');
      if (!btn) return;
      const cat = btn.dataset.cat;
      if (cat === this._active) return;
      this._active = cat;
      document.querySelectorAll('.filter-tab').forEach(b =>
        b.classList.toggle('active', b.dataset.cat === cat)
      );
      
      visibleCount = 8; 
      this._renderProducts(this._catalog.filter(cat));
    });

    document.getElementById('viewMoreBtn')?.addEventListener('click', () => {
      visibleCount += limitIncrement;
      this._renderProducts(this._catalog.getFiltered());
    });

    const ham = document.getElementById('hamburger');
    const nav = document.getElementById('main-nav');
    ham?.addEventListener('click', () => nav?.classList.toggle('open'));

    window.addEventListener('scroll', () => {
      document.getElementById('site-header')
        ?.classList.toggle('scrolled', window.scrollY > 20);
    }, { passive: true });

    document.getElementById('newsletter-form')?.addEventListener('submit', e => {
      e.preventDefault();
      const inp = document.getElementById('nl-email');
      if (inp?.value) {
        Toast.show('🎨 Thanks for subscribing! Check your inbox.');
        inp.value = '';
      }
    });
  }

  _openPreview(product) {
    const modal = document.getElementById('preview-modal');
    if (!modal) return;

    document.getElementById('modal-book-title').innerText = product.name;
    document.getElementById('modal-book-pages').innerText = `${product.pages} Pages (Ages ${product.age})`;
    
    const mainImg = document.getElementById('modal-main-img');
    let previewList = product.previewImages;

    if (!Array.isArray(previewList) || previewList.length === 0) {
      previewList = [product.image];
    }

    if (mainImg) mainImg.src = previewList[0].trim();

    const thumbContainer = document.getElementById('modal-thumbnails');
    if (thumbContainer) {
      thumbContainer.innerHTML = '';

      previewList.forEach((imgUrl, idx) => {
        if (!imgUrl) return;
        const img = document.createElement('img');
        img.src = imgUrl.trim();
        img.className = `modal-thumb ${idx === 0 ? 'active' : ''}`;
        img.alt = `Preview ${idx + 1}`;
        
        img.onclick = () => {
          if (mainImg) mainImg.src = imgUrl.trim();
          document.querySelectorAll('.modal-thumb').forEach(t => t.classList.remove('active'));
          img.classList.add('active');
        };
        thumbContainer.appendChild(img);
      });
    }

    const actBtn = document.getElementById('modal-action-btn');
    if (actBtn) {
      actBtn.onclick = () => {
        this._addToCart(product);
        modal.classList.remove('active');
      };
    }

    modal.classList.add('active');
  }

  _addToCart(product) {
    const result = this._cart.add(product);
    this._updateCounter();

    document.querySelectorAll(`[data-action="add"][data-id="${product.id}"]`).forEach(b => {
      b.textContent = '✓ Added';
      b.classList.add('added');
      b.style.background = 'linear-gradient(135deg, #3ECF8E, #1DB481)';
    });

    Toast.show(
      result === 'added'
        ? `🎉 "${product.name}" added to cart!`
        : `Updated quantity for "${product.name}"`
    );
  }
}

/* ================================================================
   CLASS: CheckoutPage — cart page controller
   ================================================================ */
class CheckoutPage {
  constructor() {
    this._cart  = new CartManager();
    this._codes = { KIDS10: 10, SAVE20: 20, EVERNEW: 15 };
    this._disc  = 0;
    this._render();
    this._bindEvents();
  }

  _render() {
    this._renderItems();
    this._renderSummary();
    this._setCount();
  }

  _renderItems() {
    const el = document.getElementById('cart-items');
    if (!el) return;

    const items = this._cart.getItems();

    if (!items.length) {
      el.innerHTML = `
        <div class="empty-cart" style="text-align:center; padding:40px;">
          <div class="icon" style="font-size:3rem; margin-bottom:10px;">🛒</div>
          <h3>Your cart is empty</h3>
          <p>Add some amazing coloring books to get started!</p>
          <a href="index.html" class="btn btn-primary btn-sm" style="margin-top:15px;">Browse Books</a>
        </div>`;
      return;
    }

    el.innerHTML = items.map(({ product: p, qty }) => {
      const imgHTML = p.image
        ? `<img src="${p.image}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;border-radius:var(--r-md);"
               onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
           <span style="display:none;font-size:2rem;">🎨</span>`
        : `<span style="font-size:2rem;">🎨</span>`;

      return `
        <div class="cart-item" data-id="${p.id}" style="display:grid; grid-template-columns:70px 1fr auto; gap:16px; align-items:center; padding:16px 20px; border-bottom:1.5px solid var(--border);">
          <div style="width:70px; height:85px; border-radius:8px; overflow:hidden; border:1px solid var(--border);">
            ${imgHTML}
          </div>
          <div>
            <div style="font-family:var(--font-h); font-weight:800; font-size:1rem; margin-bottom:4px;">${p.name}</div>
            <div style="color:var(--muted); font-size:0.8rem;">${p.category} · ${p.pages} pages</div>
            <div style="display:flex; align-items:center; gap:8px; margin-top:8px;">
              <button class="qty-btn" data-action="dec" data-id="${p.id}" style="width:24px;height:24px;background:#fff;border:1px solid var(--border);border-radius:4px;cursor:pointer;font-weight:900;">−</button>
              <span style="font-weight:800;font-size:0.9rem;">${qty}</span>
              <button class="qty-btn" data-action="inc" data-id="${p.id}" style="width:24px;height:24px;background:#fff;border:1px solid var(--border);border-radius:4px;cursor:pointer;font-weight:900;">+</button>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="color:var(--primary); font-weight:900; font-size:1rem; margin-bottom:8px;">$${(p.price * qty).toFixed(2)}</div>
            <button data-action="rm" data-id="${p.id}" style="background:none; border:none; color:#ef4444; font-size:0.85rem; cursor:pointer; font-weight:700;">🗑 Remove</button>
          </div>
        </div>`;
    }).join('');
  }

  _renderSummary() {
    const sub   = this._cart.getSubtotal();
    const disc  = sub * (this._disc / 100);
    const total = sub - disc;
    const set   = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('sum-sub',    `$${sub.toFixed(2)}`);
    set('sum-disc',   this._disc > 0 ? `-$${disc.toFixed(2)}` : 'None');
    set('sum-ship',   'Free Instant PDF ✈️');
    set('sum-total',  `$${total.toFixed(2)}`);
  }

  _setCount() {
    const n = this._cart.getCount();
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('item-count', `${n} item${n !== 1 ? 's' : ''}`);
    set('cart-count', n);
  }

  _bindEvents() {
    document.getElementById('cart-items')?.addEventListener('click', e => {
      const btn    = e.target.closest('[data-action]');
      if (!btn) return;
      const id     = parseInt(btn.dataset.id);
      const item   = this._cart.getItems().find(i => i.product.id === id);
      const action = btn.dataset.action;

      if (action === 'inc') this._cart.setQty(id, (item?.qty || 0) + 1);
      if (action === 'dec') this._cart.setQty(id, (item?.qty || 1) - 1);
      if (action === 'rm')  this._cart.remove(id);
      this._render();
    });

    document.getElementById('promo-form')?.addEventListener('submit', e => {
      e.preventDefault();
      const inp  = document.getElementById('promo-input');
      const msg  = document.getElementById('promo-msg');
      if (!inp || !msg) return;
      const code = inp.value.trim().toUpperCase();
      const d    = this._codes[code];
      msg.className = 'promo-msg';
      if (d) {
        this._disc       = d;
        msg.textContent  = `🎉 "${code}" applied! ${d}% discount added.`;
        msg.style.color = 'var(--green)';
        inp.value = '';
      } else {
        msg.textContent = `❌ Invalid code. Try: KIDS10, SAVE20, EVERNEW`;
        msg.style.color = '#ef4444';
      }
      this._renderSummary();
    });

    document.getElementById('checkout-btn')?.addEventListener('click', async () => {
      if (!this._cart.getCount()) { alert('Your cart is empty!'); return; }
      alert('🔒 Ready for checkout integration!');
    });

    const ham = document.getElementById('hamburger');
    const nav = document.getElementById('main-nav');
    ham?.addEventListener('click', () => nav?.classList.toggle('open'));
  }
}

/* ================================================================
   ENTRY POINT
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  loadProductsFromDB();
});