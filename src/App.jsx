import { useState, useEffect, useRef, useCallback } from "react";

const SAMPLE_PRODUCTS = [
  { id: "8901234567890", name: "Coca-Cola 500ml", price: 1.99, stock: 50, category: "Beverages", emoji: "🥤" },
  { id: "8901234567891", name: "Lays Classic Chips", price: 2.49, stock: 30, category: "Snacks", emoji: "🍟" },
  { id: "8901234567892", name: "Whole Milk 1L", price: 1.29, stock: 20, category: "Dairy", emoji: "🥛" },
  { id: "8901234567893", name: "White Bread Loaf", price: 2.19, stock: 15, category: "Bakery", emoji: "🍞" },
  { id: "8901234567894", name: "Eggs (12 pack)", price: 3.49, stock: 25, category: "Dairy", emoji: "🥚" },
  { id: "8901234567895", name: "Orange Juice 1L", price: 3.29, stock: 18, category: "Beverages", emoji: "🍊" },
  { id: "8901234567896", name: "Butter 250g", price: 2.79, stock: 22, category: "Dairy", emoji: "🧈" },
  { id: "8901234567897", name: "Instant Noodles", price: 0.99, stock: 60, category: "Food", emoji: "🍜" },
  { id: "8901234567898", name: "Green Tea (20 bags)", price: 3.99, stock: 35, category: "Beverages", emoji: "🍵" },
  { id: "8901234567899", name: "Hand Soap 250ml", price: 2.59, stock: 40, category: "Care", emoji: "🧼" },
];

const CATEGORIES = ["All", "Beverages", "Snacks", "Dairy", "Bakery", "Food", "Care"];

export default function POSSystem() {
  const [view, setView] = useState("pos"); // pos | inventory | history
  const [products, setProducts] = useState(() => {
    try {
      const saved = localStorage.getItem("pos_products");
      return saved ? JSON.parse(saved) : SAMPLE_PRODUCTS;
    } catch { return SAMPLE_PRODUCTS; }
  });
  const [cart, setCart] = useState([]);
  const [sales, setSales] = useState(() => {
    try {
      const saved = localStorage.getItem("pos_sales");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [barcodeInput, setBarcodeInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [notification, setNotification] = useState(null);
  const [paymentModal, setPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [cashGiven, setCashGiven] = useState("");
  const [scanning, setScanning] = useState(false);
  const [inventoryModal, setInventoryModal] = useState(null); // null | "add" | product
  const [editProduct, setEditProduct] = useState({ id: "", name: "", price: "", stock: "", category: "Food", emoji: "📦" });
  const [receiptModal, setReceiptModal] = useState(null);
  const [holdOrders, setHoldOrders] = useState([]);
  const [discountPct, setDiscountPct] = useState(0);

  const barcodeRef = useRef(null);
  const videoRef = useRef(null);
  const scannerRef = useRef(null);
  const lastScan = useRef("");

  useEffect(() => {
    localStorage.setItem("pos_products", JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem("pos_sales", JSON.stringify(sales));
  }, [sales]);

  const showNotif = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 2500);
  };

  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discountAmt = (cartTotal * discountPct) / 100;
  const finalTotal = cartTotal - discountAmt;
  const taxAmt = finalTotal * 0.1;
  const grandTotal = finalTotal + taxAmt;

  const addToCart = (product) => {
    if (product.stock <= 0) { showNotif("Out of stock!", "error"); return; }
    setCart(prev => {
      const ex = prev.find(i => i.id === product.id);
      if (ex) {
        if (ex.qty >= product.stock) { showNotif("Max stock reached!", "error"); return prev; }
        return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { ...product, qty: 1 }];
    });
    showNotif(`${product.emoji} ${product.name} added`, "success");
  };

  const handleBarcodeSubmit = (e) => {
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;
    const product = products.find(p => p.id === code);
    if (product) addToCart(product);
    else showNotif(`Barcode ${code} not found`, "error");
    setBarcodeInput("");
  };

  const updateQty = (id, delta) => {
    setCart(prev => prev.map(i => i.id === id ? { ...i, qty: Math.max(0, i.qty + delta) } : i).filter(i => i.qty > 0));
  };

  const removeFromCart = (id) => setCart(prev => prev.filter(i => i.id !== id));

  const startCameraScanner = async () => {
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      if ("BarcodeDetector" in window) {
        const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "code_128", "qr_code", "upc_a", "upc_e"] });
        const scan = async () => {
          if (!videoRef.current || !scanning) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              const code = barcodes[0].rawValue;
              if (code !== lastScan.current) {
                lastScan.current = code;
                const product = products.find(p => p.id === code);
                if (product) addToCart(product);
                else showNotif(`Barcode: ${code} not found`, "error");
                setTimeout(() => { lastScan.current = ""; }, 2000);
              }
            }
          } catch {}
          scannerRef.current = requestAnimationFrame(scan);
        };
        scannerRef.current = requestAnimationFrame(scan);
      } else {
        showNotif("Camera scanning not supported. Use manual input.", "error");
        stopScanner(stream);
      }
    } catch { showNotif("Camera access denied", "error"); setScanning(false); }
  };

  const stopScanner = (stream) => {
    if (scannerRef.current) cancelAnimationFrame(scannerRef.current);
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    if (stream) stream.getTracks().forEach(t => t.stop());
    setScanning(false);
    lastScan.current = "";
  };

  const processPayment = () => {
    if (cart.length === 0) { showNotif("Cart is empty!", "error"); return; }
    const receipt = {
      id: `TXN-${Date.now()}`,
      date: new Date().toLocaleString(),
      items: [...cart],
      subtotal: cartTotal,
      discount: discountAmt,
      tax: taxAmt,
      total: grandTotal,
      method: paymentMethod,
      cashGiven: paymentMethod === "cash" ? parseFloat(cashGiven) || grandTotal : grandTotal,
      change: paymentMethod === "cash" ? Math.max(0, (parseFloat(cashGiven) || grandTotal) - grandTotal) : 0,
    };
    setProducts(prev => prev.map(p => {
      const ci = cart.find(i => i.id === p.id);
      return ci ? { ...p, stock: p.stock - ci.qty } : p;
    }));
    setSales(prev => [receipt, ...prev]);
    setCart([]);
    setPaymentModal(false);
    setDiscountPct(0);
    setCashGiven("");
    setReceiptModal(receipt);
    showNotif("✅ Payment successful!", "success");
  };

  const holdOrder = () => {
    if (cart.length === 0) return;
    setHoldOrders(prev => [...prev, { id: Date.now(), items: [...cart], time: new Date().toLocaleTimeString() }]);
    setCart([]);
    showNotif("Order held", "success");
  };

  const recallOrder = (order) => {
    setCart(order.items);
    setHoldOrders(prev => prev.filter(o => o.id !== order.id));
  };

  const printReceipt = (receipt) => {
    const win = window.open("", "_blank", "width=400,height=700");
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Receipt - ${receipt.id}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'DM Mono', 'Courier New', monospace;
      font-size: 13px;
      color: #111;
      background: #fff;
      width: 80mm;
      margin: 0 auto;
      padding: 10px 12px 20px;
    }
    .center { text-align: center; }
    .logo { font-size: 20px; font-weight: 700; letter-spacing: 0.1em; margin-bottom: 2px; }
    .sub { font-size: 10px; color: #666; margin-bottom: 2px; }
    .divider { border: none; border-top: 1px dashed #aaa; margin: 8px 0; }
    .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
    .row.bold { font-weight: 700; font-size: 15px; margin-top: 4px; }
    .row.green { color: #007a33; }
    .row.muted { color: #666; }
    .items { margin: 4px 0; }
    .item-name { flex: 1; padding-right: 8px; }
    .barcode-area { text-align: center; margin: 10px 0 6px; letter-spacing: 4px; font-size: 28px; line-height: 1; }
    .barcode-num { font-size: 10px; letter-spacing: 2px; color: #666; }
    .footer { text-align: center; font-size: 10px; color: #888; margin-top: 10px; line-height: 1.6; }
    @media print {
      body { width: 80mm; }
      @page { margin: 0; size: 80mm auto; }
    }
  </style>
</head>
<body>
  <div class="center">
    <div class="logo">⬡ NEXUS POS</div>
    <div class="sub">123 Main Street, City • Tel: (555) 000-0000</div>
    <div class="sub">www.nexuspos.store</div>
  </div>
  <hr class="divider"/>
  <div class="row muted"><span>Date:</span><span>${receipt.date}</span></div>
  <div class="row muted"><span>TXN:</span><span>${receipt.id}</span></div>
  <div class="row muted"><span>Cashier:</span><span>Admin</span></div>
  <hr class="divider"/>
  <div class="items">
    ${receipt.items.map(i => `
      <div class="row">
        <span class="item-name">${i.name}</span>
        <span>$${(i.price * i.qty).toFixed(2)}</span>
      </div>
      <div class="row muted" style="font-size:11px;padding-left:4px">
        <span>${i.qty} x $${i.price.toFixed(2)}</span>
      </div>
    `).join("")}
  </div>
  <hr class="divider"/>
  <div class="row muted"><span>Subtotal</span><span>$${receipt.subtotal.toFixed(2)}</span></div>
  ${receipt.discount > 0 ? `<div class="row green"><span>Discount</span><span>-$${receipt.discount.toFixed(2)}</span></div>` : ""}
  <div class="row muted"><span>Tax (10%)</span><span>$${receipt.tax.toFixed(2)}</span></div>
  <hr class="divider"/>
  <div class="row bold"><span>TOTAL</span><span>$${receipt.total.toFixed(2)}</span></div>
  <hr class="divider"/>
  <div class="row muted"><span>Payment</span><span>${receipt.method.toUpperCase()}</span></div>
  ${receipt.method === "cash" ? `
  <div class="row muted"><span>Cash Given</span><span>$${receipt.cashGiven.toFixed(2)}</span></div>
  <div class="row green"><span>Change</span><span>$${receipt.change.toFixed(2)}</span></div>
  ` : ""}
  <div class="barcode-area">|||||||||||||||||||</div>
  <div class="barcode-num center">${receipt.id}</div>
  <hr class="divider"/>
  <div class="footer">
    Thank you for shopping with us!<br/>
    Returns accepted within 7 days with receipt.<br/>
    Powered by NEXUS POS
  </div>
</body>
</html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  const saveProduct = () => {
    const p = { ...editProduct, price: parseFloat(editProduct.price), stock: parseInt(editProduct.stock) };
    if (!p.id || !p.name || isNaN(p.price) || isNaN(p.stock)) { showNotif("Fill all fields!", "error"); return; }
    if (inventoryModal === "add") {
      if (products.find(x => x.id === p.id)) { showNotif("Barcode already exists!", "error"); return; }
      setProducts(prev => [...prev, p]);
      showNotif("Product added!", "success");
    } else {
      setProducts(prev => prev.map(x => x.id === p.id ? p : x));
      showNotif("Product updated!", "success");
    }
    setInventoryModal(null);
  };

  const deleteProduct = (id) => {
    setProducts(prev => prev.filter(p => p.id !== id));
    showNotif("Product deleted", "success");
  };

  const filteredProducts = products.filter(p => {
    const matchCat = selectedCategory === "All" || p.category === selectedCategory;
    const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.id.includes(searchQuery);
    return matchCat && matchSearch;
  });

  const totalSales = sales.reduce((s, t) => s + t.total, 0);
  const todaySales = sales.filter(s => new Date(s.date).toDateString() === new Date().toDateString());
  const todayRevenue = todaySales.reduce((s, t) => s + t.total, 0);

  const styles = {
    app: { minHeight: "100vh", background: "#0a0c10", color: "#e8e8e8", fontFamily: "'DM Mono', 'Courier New', monospace", display: "flex", flexDirection: "column" },
    header: { background: "linear-gradient(135deg, #111520 0%, #0d1117 100%)", borderBottom: "1px solid #1e2a3a", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60, position: "sticky", top: 0, zIndex: 100 },
    logo: { display: "flex", alignItems: "center", gap: 10, fontSize: 18, fontWeight: 700, color: "#f0a500", letterSpacing: "0.05em" },
    nav: { display: "flex", gap: 4 },
    navBtn: (active) => ({ background: active ? "rgba(240,165,0,0.15)" : "transparent", border: active ? "1px solid rgba(240,165,0,0.4)" : "1px solid transparent", color: active ? "#f0a500" : "#8899aa", padding: "6px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13, letterSpacing: "0.05em", fontFamily: "inherit", transition: "all 0.2s" }),
    main: { flex: 1, display: "flex", gap: 0, overflow: "hidden", height: "calc(100vh - 60px)" },
    left: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: 20, gap: 16 },
    right: { width: 360, background: "#0d1117", borderLeft: "1px solid #1e2a3a", display: "flex", flexDirection: "column", padding: 20, gap: 12 },
    card: { background: "#111520", border: "1px solid #1e2a3a", borderRadius: 12, padding: 16 },
    input: { background: "#0d1117", border: "1px solid #2a3a50", borderRadius: 8, color: "#e8e8e8", padding: "10px 14px", fontSize: 14, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" },
    btn: (variant = "default") => {
      const variants = {
        primary: { background: "linear-gradient(135deg, #f0a500, #e09000)", color: "#000", border: "none" },
        success: { background: "linear-gradient(135deg, #00c851, #007a33)", color: "#fff", border: "none" },
        danger: { background: "rgba(220,50,50,0.15)", color: "#ff6b6b", border: "1px solid rgba(220,50,50,0.3)" },
        ghost: { background: "transparent", color: "#8899aa", border: "1px solid #2a3a50" },
        default: { background: "#1e2a3a", color: "#e8e8e8", border: "1px solid #2a3a50" },
      };
      return { ...variants[variant], padding: "10px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600, letterSpacing: "0.04em", transition: "all 0.2s", display: "inline-flex", alignItems: "center", gap: 6 };
    },
    productGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, overflow: "auto", flex: 1 },
    productCard: (outStock) => ({ background: outStock ? "rgba(220,50,50,0.05)" : "#111520", border: outStock ? "1px solid rgba(220,50,50,0.2)" : "1px solid #1e2a3a", borderRadius: 10, padding: 14, cursor: outStock ? "not-allowed" : "pointer", transition: "all 0.2s", opacity: outStock ? 0.6 : 1 }),
    tag: (color) => ({ background: `rgba(${color},0.15)`, color: `rgb(${color})`, padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, letterSpacing: "0.05em" }),
    cartItem: { display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #1e2a3a" },
    modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)" },
    modal: { background: "#111520", border: "1px solid #2a3a50", borderRadius: 16, padding: 28, width: 420, maxWidth: "95vw", boxShadow: "0 24px 48px rgba(0,0,0,0.5)" },
  };

  return (
    <div style={styles.app}>
      {/* Notification */}
      {notification && (
        <div style={{ position: "fixed", top: 70, right: 20, background: notification.type === "error" ? "#2a1010" : "#0d2a1a", border: `1px solid ${notification.type === "error" ? "#ff6b6b" : "#00c851"}`, color: notification.type === "error" ? "#ff6b6b" : "#00c851", padding: "10px 18px", borderRadius: 8, zIndex: 9999, fontSize: 13, fontFamily: "inherit", animation: "slideIn 0.3s ease" }}>
          {notification.msg}
        </div>
      )}

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.logo}>⬡ NEXUS POS</div>
        <div style={styles.nav}>
          {[["pos","🖥 Register"], ["inventory","📦 Inventory"], ["history","📊 Sales"]].map(([v,l]) => (
            <button key={v} style={styles.navBtn(view === v)} onClick={() => setView(v)}>{l}</button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "#556677", display: "flex", gap: 16 }}>
          <span>📅 {new Date().toLocaleDateString()}</span>
          <span style={{ color: "#f0a500" }}>💰 Today: ${todayRevenue.toFixed(2)}</span>
        </div>
      </div>

      {/* POS VIEW */}
      {view === "pos" && (
        <div style={styles.main}>
          {/* Left: Products */}
          <div style={styles.left}>
            {/* Scan & Search */}
            <div style={{ display: "flex", gap: 10 }}>
              <form onSubmit={handleBarcodeSubmit} style={{ flex: 1, display: "flex", gap: 8 }}>
                <input ref={barcodeRef} style={{ ...styles.input, flex: 1, borderColor: "#2a4060", background: "#0d1828" }} value={barcodeInput} onChange={e => setBarcodeInput(e.target.value)} placeholder="🔍 Scan barcode or enter manually + Enter..." autoFocus />
                <button type="submit" style={{ ...styles.btn("primary"), whiteSpace: "nowrap" }}>Add</button>
              </form>
              <button style={{ ...styles.btn(scanning ? "danger" : "default"), whiteSpace: "nowrap" }} onClick={() => scanning ? stopScanner() : startCameraScanner()}>
                {scanning ? "⏹ Stop" : "📷 Camera"}
              </button>
            </div>

            {/* Camera scanner */}
            {scanning && (
              <div style={{ ...styles.card, position: "relative", overflow: "hidden", padding: 0 }}>
                <video ref={videoRef} style={{ width: "100%", maxHeight: 180, objectFit: "cover", display: "block" }} />
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                  <div style={{ width: 200, height: 80, border: "2px solid #f0a500", borderRadius: 4, boxShadow: "0 0 20px rgba(240,165,0,0.3)" }} />
                </div>
                <div style={{ position: "absolute", bottom: 8, left: 0, right: 0, textAlign: "center", fontSize: 12, color: "#f0a500" }}>
                  📡 Scanning... align barcode in frame
                </div>
              </div>
            )}

            {/* Category filter */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {CATEGORIES.map(c => (
                <button key={c} style={{ ...styles.btn(selectedCategory === c ? "primary" : "ghost"), padding: "6px 14px", fontSize: 12 }} onClick={() => setSelectedCategory(c)}>{c}</button>
              ))}
            </div>

            {/* Search */}
            <input style={styles.input} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="🔎 Search products..." />

            {/* Product Grid */}
            <div style={styles.productGrid}>
              {filteredProducts.map(p => (
                <div key={p.id} style={styles.productCard(p.stock === 0)} onClick={() => p.stock > 0 && addToCart(p)}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{p.emoji}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, lineHeight: 1.3 }}>{p.name}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#f0a500", marginBottom: 6 }}>${p.price.toFixed(2)}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={styles.tag(p.stock > 10 ? "0,200,80" : p.stock > 0 ? "240,165,0" : "220,50,50")}>
                      {p.stock > 0 ? `${p.stock} left` : "OUT"}
                    </span>
                    <span style={{ fontSize: 10, color: "#556677" }}>{p.category}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Hold orders */}
            {holdOrders.length > 0 && (
              <div style={{ ...styles.card, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "#8899aa", alignSelf: "center" }}>Held Orders:</span>
                {holdOrders.map(o => (
                  <button key={o.id} style={{ ...styles.btn("default"), fontSize: 11, padding: "5px 10px" }} onClick={() => recallOrder(o)}>
                    📋 Order {o.time} ({o.items.length} items)
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Cart */}
          <div style={styles.right}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#f0a500", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>🛒 Cart ({cart.length})</span>
              {cart.length > 0 && <button style={{ ...styles.btn("danger"), padding: "4px 10px", fontSize: 11 }} onClick={() => setCart([])}>Clear</button>}
            </div>

            <div style={{ flex: 1, overflow: "auto" }}>
              {cart.length === 0 ? (
                <div style={{ textAlign: "center", color: "#3a4a5a", padding: "40px 0", fontSize: 13 }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🛒</div>
                  Scan or click products to add
                </div>
              ) : cart.map(item => (
                <div key={item.id} style={styles.cartItem}>
                  <span style={{ fontSize: 20 }}>{item.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: "#8899aa" }}>${item.price.toFixed(2)} ea</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button style={{ width: 24, height: 24, border: "1px solid #2a3a50", borderRadius: 4, background: "#1e2a3a", color: "#e8e8e8", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => updateQty(item.id, -1)}>−</button>
                    <span style={{ width: 24, textAlign: "center", fontSize: 13, fontWeight: 700 }}>{item.qty}</span>
                    <button style={{ width: 24, height: 24, border: "1px solid #2a3a50", borderRadius: 4, background: "#1e2a3a", color: "#e8e8e8", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => updateQty(item.id, 1)}>+</button>
                  </div>
                  <div style={{ minWidth: 50, textAlign: "right", fontSize: 13, fontWeight: 700, color: "#f0a500" }}>${(item.price * item.qty).toFixed(2)}</div>
                  <button style={{ background: "none", border: "none", color: "#556677", cursor: "pointer", fontSize: 14, padding: 2 }} onClick={() => removeFromCart(item.id)}>✕</button>
                </div>
              ))}
            </div>

            {/* Discount */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#8899aa", whiteSpace: "nowrap" }}>Discount %</span>
              <input type="number" style={{ ...styles.input, width: 70 }} value={discountPct} onChange={e => setDiscountPct(Math.min(100, Math.max(0, Number(e.target.value))))} min={0} max={100} />
            </div>

            {/* Totals */}
            <div style={{ ...styles.card, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, color: "#8899aa" }}>
                <span>Subtotal</span><span>${cartTotal.toFixed(2)}</span>
              </div>
              {discountPct > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, color: "#00c851" }}>
                <span>Discount ({discountPct}%)</span><span>-${discountAmt.toFixed(2)}</span>
              </div>}
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, color: "#8899aa" }}>
                <span>Tax (10%)</span><span>${taxAmt.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 700, color: "#f0a500", paddingTop: 8, borderTop: "1px solid #1e2a3a" }}>
                <span>TOTAL</span><span>${grandTotal.toFixed(2)}</span>
              </div>
            </div>

            <button style={{ ...styles.btn("ghost"), justifyContent: "center" }} onClick={holdOrder} disabled={cart.length === 0}>⏸ Hold Order</button>
            <button style={{ ...styles.btn("success"), justifyContent: "center", fontSize: 15, padding: "14px 18px" }} onClick={() => setPaymentModal(true)} disabled={cart.length === 0}>
              💳 CHARGE ${grandTotal.toFixed(2)}
            </button>
          </div>
        </div>
      )}

      {/* INVENTORY VIEW */}
      {view === "inventory" && (
        <div style={{ flex: 1, padding: 24, overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#f0a500" }}>📦 Inventory</div>
              <div style={{ fontSize: 13, color: "#556677" }}>{products.length} products | {products.reduce((s, p) => s + p.stock, 0)} total units</div>
            </div>
            <button style={styles.btn("primary")} onClick={() => { setEditProduct({ id: "", name: "", price: "", stock: "", category: "Food", emoji: "📦" }); setInventoryModal("add"); }}>
              + Add Product
            </button>
          </div>

          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
            {[
              { label: "Total Products", value: products.length, icon: "📦" },
              { label: "Low Stock (≤5)", value: products.filter(p => p.stock > 0 && p.stock <= 5).length, icon: "⚠️" },
              { label: "Out of Stock", value: products.filter(p => p.stock === 0).length, icon: "❌" },
              { label: "Categories", value: [...new Set(products.map(p => p.category))].length, icon: "🏷" },
            ].map(s => (
              <div key={s.label} style={styles.card}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>{s.icon}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#f0a500" }}>{s.value}</div>
                <div style={{ fontSize: 12, color: "#556677" }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Table */}
          <div style={{ ...styles.card, padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#0d1117", borderBottom: "1px solid #1e2a3a" }}>
                  {["Product", "Barcode", "Category", "Price", "Stock", "Status", "Actions"].map(h => (
                    <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "#556677", fontWeight: 600, fontSize: 11, letterSpacing: "0.08em" }}>{h.toUpperCase()}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.map((p, i) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid #1e2a3a", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)", transition: "background 0.2s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(240,165,0,0.04)"}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)"}
                  >
                    <td style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 20 }}>{p.emoji}</span>
                      <span style={{ fontWeight: 600 }}>{p.name}</span>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#556677", fontFamily: "monospace", fontSize: 12 }}>{p.id}</td>
                    <td style={{ padding: "12px 16px" }}><span style={styles.tag("100,160,220")}>{p.category}</span></td>
                    <td style={{ padding: "12px 16px", color: "#f0a500", fontWeight: 700 }}>${p.price.toFixed(2)}</td>
                    <td style={{ padding: "12px 16px", fontWeight: 700 }}>{p.stock}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={styles.tag(p.stock === 0 ? "220,50,50" : p.stock <= 5 ? "240,165,0" : "0,200,80")}>
                        {p.stock === 0 ? "OUT" : p.stock <= 5 ? "LOW" : "OK"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button style={{ ...styles.btn("ghost"), padding: "4px 10px", fontSize: 11 }} onClick={() => { setEditProduct({ ...p }); setInventoryModal("edit"); }}>✏️ Edit</button>
                        <button style={{ ...styles.btn("danger"), padding: "4px 10px", fontSize: 11 }} onClick={() => deleteProduct(p.id)}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* HISTORY VIEW */}
      {view === "history" && (
        <div style={{ flex: 1, padding: 24, overflow: "auto" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#f0a500", marginBottom: 6 }}>📊 Sales History</div>
          <div style={{ fontSize: 13, color: "#556677", marginBottom: 20 }}>{sales.length} transactions | ${totalSales.toFixed(2)} total revenue</div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
            {[
              { label: "Today's Sales", value: todaySales.length, sub: `$${todayRevenue.toFixed(2)}`, icon: "📅" },
              { label: "Total Transactions", value: sales.length, sub: "all time", icon: "🧾" },
              { label: "Total Revenue", value: `$${totalSales.toFixed(2)}`, sub: "all time", icon: "💰" },
              { label: "Avg. Transaction", value: `$${sales.length ? (totalSales / sales.length).toFixed(2) : "0.00"}`, sub: "per sale", icon: "📈" },
            ].map(s => (
              <div key={s.label} style={styles.card}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>{s.icon}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#f0a500" }}>{s.value}</div>
                <div style={{ fontSize: 12, color: "#556677" }}>{s.label}</div>
                <div style={{ fontSize: 11, color: "#3a4a5a" }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {sales.length === 0 ? (
            <div style={{ textAlign: "center", color: "#3a4a5a", padding: "60px 0", fontSize: 14 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
              No sales yet. Process your first transaction!
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {sales.map(s => (
                <div key={s.id} style={{ ...styles.card, display: "flex", alignItems: "center", gap: 16, cursor: "pointer" }} onClick={() => setReceiptModal(s)}>
                  <div style={{ width: 44, height: 44, borderRadius: 8, background: s.method === "cash" ? "rgba(0,200,80,0.15)" : "rgba(100,160,220,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
                    {s.method === "cash" ? "💵" : "💳"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{s.id}</div>
                    <div style={{ fontSize: 12, color: "#556677" }}>{s.date} · {s.items.length} items · {s.method.toUpperCase()}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#f0a500" }}>${s.total.toFixed(2)}</div>
                    {s.discount > 0 && <div style={{ fontSize: 11, color: "#00c851" }}>-${s.discount.toFixed(2)} disc</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PAYMENT MODAL */}
      {paymentModal && (
        <div style={styles.modalOverlay} onClick={e => e.target === e.currentTarget && setPaymentModal(false)}>
          <div style={styles.modal}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#f0a500", marginBottom: 20 }}>💳 Payment</div>

            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              {["cash", "card"].map(m => (
                <button key={m} style={{ ...styles.btn(paymentMethod === m ? "primary" : "ghost"), flex: 1, justifyContent: "center", fontSize: 15, padding: 12 }} onClick={() => setPaymentMethod(m)}>
                  {m === "cash" ? "💵 Cash" : "💳 Card"}
                </button>
              ))}
            </div>

            <div style={{ ...styles.card, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#8899aa", marginBottom: 6, fontSize: 13 }}><span>Subtotal</span><span>${cartTotal.toFixed(2)}</span></div>
              {discountAmt > 0 && <div style={{ display: "flex", justifyContent: "space-between", color: "#00c851", marginBottom: 6, fontSize: 13 }}><span>Discount</span><span>-${discountAmt.toFixed(2)}</span></div>}
              <div style={{ display: "flex", justifyContent: "space-between", color: "#8899aa", marginBottom: 8, fontSize: 13 }}><span>Tax (10%)</span><span>${taxAmt.toFixed(2)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, fontWeight: 800, color: "#f0a500", paddingTop: 8, borderTop: "1px solid #2a3a50" }}><span>TOTAL</span><span>${grandTotal.toFixed(2)}</span></div>
            </div>

            {paymentMethod === "cash" && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: "#8899aa", display: "block", marginBottom: 6 }}>Cash Given</label>
                <input type="number" style={{ ...styles.input, fontSize: 18, fontWeight: 700 }} value={cashGiven} onChange={e => setCashGiven(e.target.value)} placeholder={grandTotal.toFixed(2)} autoFocus />
                {cashGiven && parseFloat(cashGiven) >= grandTotal && (
                  <div style={{ marginTop: 10, padding: 12, background: "rgba(0,200,80,0.1)", borderRadius: 8, border: "1px solid rgba(0,200,80,0.2)", fontSize: 16, fontWeight: 700, color: "#00c851" }}>
                    Change: ${(parseFloat(cashGiven) - grandTotal).toFixed(2)}
                  </div>
                )}
                {cashGiven && parseFloat(cashGiven) < grandTotal && (
                  <div style={{ marginTop: 10, padding: 10, background: "rgba(220,50,50,0.1)", borderRadius: 8, border: "1px solid rgba(220,50,50,0.2)", fontSize: 13, color: "#ff6b6b" }}>
                    Short by ${(grandTotal - parseFloat(cashGiven)).toFixed(2)}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...styles.btn("ghost"), flex: 1, justifyContent: "center" }} onClick={() => setPaymentModal(false)}>Cancel</button>
              <button style={{ ...styles.btn("success"), flex: 2, justifyContent: "center", fontSize: 15, padding: "13px 18px" }}
                onClick={processPayment}
                disabled={paymentMethod === "cash" && cashGiven && parseFloat(cashGiven) < grandTotal}>
                ✅ Confirm Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INVENTORY MODAL */}
      {inventoryModal && (
        <div style={styles.modalOverlay} onClick={e => e.target === e.currentTarget && setInventoryModal(null)}>
          <div style={styles.modal}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#f0a500", marginBottom: 20 }}>
              {inventoryModal === "add" ? "➕ Add Product" : "✏️ Edit Product"}
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {[
                { label: "Barcode / Product ID", key: "id", type: "text", placeholder: "e.g. 8901234567890" },
                { label: "Product Name", key: "name", type: "text", placeholder: "e.g. Coca-Cola 500ml" },
                { label: "Price ($)", key: "price", type: "number", placeholder: "0.00" },
                { label: "Stock Quantity", key: "stock", type: "number", placeholder: "0" },
                { label: "Emoji Icon", key: "emoji", type: "text", placeholder: "📦" },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 12, color: "#8899aa", display: "block", marginBottom: 5 }}>{f.label}</label>
                  <input type={f.type} style={styles.input} value={editProduct[f.key]} onChange={e => setEditProduct(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} disabled={f.key === "id" && inventoryModal !== "add"} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 12, color: "#8899aa", display: "block", marginBottom: 5 }}>Category</label>
                <select style={{ ...styles.input }} value={editProduct.category} onChange={e => setEditProduct(p => ({ ...p, category: e.target.value }))}>
                  {["Beverages","Snacks","Dairy","Bakery","Food","Care","Other"].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button style={{ ...styles.btn("ghost"), flex: 1, justifyContent: "center" }} onClick={() => setInventoryModal(null)}>Cancel</button>
              <button style={{ ...styles.btn("primary"), flex: 2, justifyContent: "center" }} onClick={saveProduct}>
                {inventoryModal === "add" ? "Add Product" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RECEIPT MODAL */}
      {receiptModal && (
        <div style={styles.modalOverlay} onClick={e => e.target === e.currentTarget && setReceiptModal(null)}>
          <div style={{ ...styles.modal, width: 380, fontFamily: "'DM Mono', monospace" }}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>⬡ NEXUS POS</div>
              <div style={{ fontSize: 11, color: "#556677" }}>RECEIPT</div>
              <div style={{ fontSize: 11, color: "#556677" }}>{receiptModal.date}</div>
              <div style={{ fontSize: 11, color: "#556677" }}>{receiptModal.id}</div>
            </div>
            <div style={{ borderTop: "1px dashed #2a3a50", borderBottom: "1px dashed #2a3a50", padding: "12px 0", margin: "0 0 12px", fontSize: 13 }}>
              {receiptModal.items.map(i => (
                <div key={i.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span>{i.emoji} {i.name} × {i.qty}</span>
                  <span>${(i.price * i.qty).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 13, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#8899aa", marginBottom: 4 }}><span>Subtotal</span><span>${receiptModal.subtotal.toFixed(2)}</span></div>
              {receiptModal.discount > 0 && <div style={{ display: "flex", justifyContent: "space-between", color: "#00c851", marginBottom: 4 }}><span>Discount</span><span>-${receiptModal.discount.toFixed(2)}</span></div>}
              <div style={{ display: "flex", justifyContent: "space-between", color: "#8899aa", marginBottom: 8 }}><span>Tax (10%)</span><span>${receiptModal.tax.toFixed(2)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 18, color: "#f0a500" }}><span>TOTAL</span><span>${receiptModal.total.toFixed(2)}</span></div>
            </div>
            {receiptModal.method === "cash" && (
              <div style={{ fontSize: 13, color: "#8899aa" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>Cash Given</span><span>${receiptModal.cashGiven.toFixed(2)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#00c851" }}><span>Change</span><span>${receiptModal.change.toFixed(2)}</span></div>
              </div>
            )}
            <div style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: "#3a4a5a" }}>
              Payment: {receiptModal.method.toUpperCase()} · Thank you!
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button style={{ ...styles.btn("ghost"), flex: 1, justifyContent: "center" }} onClick={() => setReceiptModal(null)}>Close</button>
              <button style={{ ...styles.btn("primary"), flex: 2, justifyContent: "center", fontSize: 14 }} onClick={() => printReceipt(receiptModal)}>
                🖨️ Print Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #0a0c10; }
        ::-webkit-scrollbar-thumb { background: #2a3a50; border-radius: 3px; }
        @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
        input[type=number]::-webkit-inner-spin-button { opacity: 0.3; }
        select option { background: #111520; color: #e8e8e8; }
      `}</style>
    </div>
  );
}