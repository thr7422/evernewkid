'use strict';

// ================================================================
// ⚙️ 1. SUPABASE CONFIGURATION
// ================================================================
const SUPABASE_URL = 'https://tspwyzqwuqbuetsztxrw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzcHd5enF3dXFidWV0c3p0eHJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1ODI5MzcsImV4cCI6MjEwMDE1ODkzN30.UA828dNNhA1KV5rUiqTRHzvFc41UBu0e-8D4JBzmejs';

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let PRODUCTS = [];

/* ================================================================
   🔄 2. SUPABASE DATA LOADER (100% Robust Parser & URL Generator)
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

    // ⚠️ یہاں اپنی Supabase بکیٹ کا اصل نام لکھیں (مثلاً 'products' یا جو بھی نام ہے)
    const STORAGE_BUCKET_NAME = 'products'; 

    PRODUCTS = data.map(item => {
      let dbPreviews = item.preview_images;
      let rawPreviews = [];

      // اگر ڈیٹا بیس میں ارے (Array) کی شکل میں ہے
      if (Array.isArray(dbPreviews)) {
        rawPreviews = dbPreviews;
      } 
      // اگر ڈیٹا بیس میں سٹرنگ یا ٹیکسٹ کی شکل میں ہے
      else if (typeof dbPreviews === 'string') {
        try {
          rawPreviews = JSON.parse(dbPreviews);
        } catch (e) {
          // اگر JSON parse نہ ہو تو بریکٹس ہٹا کر کما سے الگ کریں
          let clean = dbPreviews.replace(/^\[|\]$|^\{|\}$/g, '');
          rawPreviews = clean.split(',').map(s => s.replace(/["']/g, '').trim());
        }
      }

      // اگر پھر بھی خالی نکلے تو مین امیج کو استعمال کریں
      if (!rawPreviews || rawPreviews.length === 0) {
        rawPreviews = [item.image_url];
      }

      // اب ہر ایک پاتھ کو مکمل پبلک URL میں تبدیل کریں
      let finalPreviews = rawPreviews.map(pathOrUrl => {
        if (!pathOrUrl) return '';
        let cleanPath = pathOrUrl.trim();

        // اگر پہلے سے ہی http لنک ہے تو ویسے ہی رہنے دیں
        if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
          return cleanPath;
        }

        // بصورت دیگر Supabase سے پبلک URL جنریٹ کریں
        const { data: publicUrlData } = supabase
          .storage
          .from(STORAGE_BUCKET_NAME)
          .getPublicUrl(cleanPath);

        return publicUrlData.publicUrl;
      });

      // مین امیج کے لیے بھی پبلک یو آر ایل کا چیک
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
        previewImages: finalPreviews, // 👈 اب اس میں تمام 5 تصاویر کے مکمل لنکس ہوں گے
        desc: item.description || '',
        badge: item.badge || 'hot'
      };
    });

    console.log("Processed Products with Images:", PRODUCTS);

    renderHomepageProducts(PRODUCTS);
    updateCartCount();

  } catch (err) {
    console.error("Error loading products from DB:", err);
  }
}

/* ================================================================
   🎨 3. RENDER HOMEPAGE PRODUCTS
   ================================================================ */
function renderHomepageProducts(list) {
  const grid = document.getElementById('products-grid');
  if (!grid) return;

  grid.innerHTML = list.map(p => `
    <article class="product-card" data-id="${p.id}">
      <div class="pc-thumb">
        <img src="${p.image}" alt="${p.name}" class="pc-real-img" data-action="preview" data-id="${p.id}" style="cursor:pointer;" />
        <div class="pc-overlay">
          <button class="pc-overlay-btn" data-action="preview" data-id="${p.id}">👁️ Quick Preview</button>
          <button class="pc-overlay-btn" data-action="add" data-id="${p.id}">🛒 Add to Cart</button>
        </div>
      </div>
      <div class="pc-body">
        <div class="pc-cat"><span>${p.category}</span></div>
        <h3 class="pc-name" data-action="preview" data-id="${p.id}" style="cursor:pointer;">${p.name}</h3>
        <p class="pc-desc">${p.desc}</p>
        <div class="pc-footer">
          <div class="pc-price"><strong>$${p.price.toFixed(2)}</strong> <span class="pc-price-old">$${p.original.toFixed(2)}</span></div>
          <button class="btn btn-primary" data-action="add" data-id="${p.id}">+ Add</button>
        </div>
      </div>
    </article>
  `).join('');
}

/* ================================================================
   🛒 4. CART & LOCALSTORAGE MANAGER
   ================================================================ */
class CartManager {
  static KEY = 'evernew_cart_v2';
  static getItems() {
    try { return JSON.parse(localStorage.getItem(CartManager.KEY)) || []; }
    catch { return []; }
  }
  static add(product) {
    let items = CartManager.getItems();
    let ex = items.find(i => i.product.id === product.id);
    if (ex) {
      ex.qty++;
    } else {
      items.push({ product, qty: 1 });
    }
    localStorage.setItem(CartManager.KEY, JSON.stringify(items));
    updateCartCount();
  }
  static getCount() {
    return CartManager.getItems().reduce((s, i) => s + i.qty, 0);
  }
}

function updateCartCount() {
  const countEl = document.getElementById('cart-count');
  if (countEl) countEl.textContent = CartManager.getCount();
}

/* ================================================================
   🖱️ 5. GLOBAL CLICK LISTENERS
   ================================================================ */
document.addEventListener('click', e => {
  const target = e.target.closest('[data-action]');
  if (!target) return;

  const action = target.dataset.action;
  const id = parseInt(target.dataset.id);
  const product = PRODUCTS.find(p => p.id === id);
  if (!product) return;

  if (action === 'add') {
    CartManager.add(product);
    alert(`🎉 "${product.name}" کارٹ میں شامل ہو گئی!`);
  }

  if (action === 'preview') {
    openPreviewModal(product);
  }
});

/* ================================================================
   🖼️ 6. MODAL PREVIEW GALLERY SYSTEM (Database Images)
   ================================================================ */
function openPreviewModal(product) {
  const modal = document.getElementById('preview-modal');
  if (!modal) return;

  const titleEl = document.getElementById('modal-book-title');
  const pagesEl = document.getElementById('modal-book-pages');
  if (titleEl) titleEl.innerText = product.name;
  if (pagesEl) pagesEl.innerText = `${product.pages} Pages (Ages ${product.age})`;

  const mainImg = document.getElementById('modal-main-img');
  
  // 🌟 یہاں تصدیق کی گئی ہے کہ ڈیٹا بیس والی 5 تصاویر کا ارے صحیح استعمال ہو
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
      
      // تھمب نیل کی سٹائلنگ
      img.style.width = '55px';
      img.style.height = '70px';
      img.style.objectFit = 'cover';
      img.style.borderRadius = '6px';
      img.style.cursor = 'pointer';
      img.style.border = idx === 0 ? '2px solid #FF6B6B' : '2px solid transparent';

      img.onclick = () => {
        if (mainImg) mainImg.src = imgUrl.trim();
        thumbContainer.querySelectorAll('img').forEach(t => t.style.borderColor = 'transparent');
        img.style.border = '2px solid #FF6B6B';
      };

      thumbContainer.appendChild(img);
    });
  }

  const actBtn = document.getElementById('modal-action-btn');
  if (actBtn) {
    actBtn.onclick = () => {
      CartManager.add(product);
      modal.classList.remove('active');
      alert(`🎉 "${product.name}" کارٹ میں شامل ہو گئی!`);
    };
  }

  modal.classList.add('active');
}

window.closePreviewModal = function() {
  const modal = document.getElementById('preview-modal');
  if (modal) modal.classList.remove('active');
};

/* ================================================================
   🚀 7. INITIALIZATION ON DOM LOAD
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  loadProductsFromDB();
});