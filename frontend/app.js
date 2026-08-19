const app = document.getElementById("app");
const toastContainer = document.getElementById("toast-container");

const state = {
  token: localStorage.getItem("finora_token") || "",
  user: JSON.parse(localStorage.getItem("finora_user") || "null"),
  dashboard: null,
  transactions: [],
  budgets: [],
  goals: [],
  chat: [],
  floatingOpen: false,
  route: location.hash.replace("#", "") || "dashboard",
};

const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN", {maximumFractionDigits: 0})}`;
const esc = (s="") => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const initials = (name="U") => name.split(/\s+/).map(x => x[0]).slice(0,2).join("").toUpperCase();

function toast(message, type="info"){
  const el = document.createElement("div");
  el.textContent = message;
  el.style.cssText = `position:fixed;right:22px;top:22px;z-index:200;background:${type==="error"?"#ffe9ef":"#fff"};color:#29215e;padding:13px 17px;border:1px solid #e7ddff;border-radius:14px;box-shadow:0 15px 40px rgba(55,30,120,.18);font-size:12px;font-weight:700`;
  toastContainer.appendChild(el);
  setTimeout(()=>el.remove(),2800);
}

async function api(url, options={}){
  const headers = {"Content-Type":"application/json", ...(options.headers||{})};
  if(state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(url, {...options, headers});
  let data = {};
  try { data = await res.json(); } catch {}
  if(res.status === 401){
    logout(false);
    throw new Error("Session expired. Please login again.");
  }
  if(!res.ok) throw new Error(data.message || "Something went wrong.");
  return data;
}

function logout(show=true){
  state.token = ""; state.user = null;
  localStorage.removeItem("finora_token");
  localStorage.removeItem("finora_user");
  if(show) toast("Logged out successfully");
  location.hash = "login";
  render();
}

async function loadAll(){
  if(!state.token) return;
  try{
    const [dash, tx, budgets, goals, history] = await Promise.all([
      api("/api/dashboard"),
      api("/api/transactions"),
      api("/api/budgets"),
      api("/api/goals"),
      api("/api/ai/history"),
    ]);
    state.dashboard = dash;
    state.transactions = tx.transactions || [];
    state.budgets = budgets.budgets || [];
    state.goals = goals.goals || [];
    state.chat = history.messages || [];
    state.user = dash.user;
    localStorage.setItem("finora_user", JSON.stringify(state.user));
  }catch(e){
    console.error(e);
  }
}

function authPage(mode="login"){
  const login = mode === "login";
  app.innerHTML = `
  <div class="auth-page">
    <section class="auth-visual">
      <div class="auth-art">
        <div class="avatar-art">👩🏻‍💻</div>
        <h1>Finora AI</h1>
        <p>Your AI-powered finance companion 💜</p>
        <div class="auth-points">
          <div>✦ AI insights</div>
          <div>◎ Goal tracking</div>
          <div>₹ Secure finance data</div>
        </div>
      </div>
    </section>
    <section class="auth-form-wrap">
      <form class="auth-form" id="auth-form">
        <div class="auth-top">
          <div class="brand"><div class="brand-icon">F</div><span>Finora AI</span></div>
          <button type="button" class="icon-btn" id="theme-btn">☾</button>
        </div>
        <div class="badge">${login ? "WELCOME BACK 👋" : "CREATE ACCOUNT ✨"}</div>
        <h2>${login ? "Your money.<br>Your smarter future." : "Your smarter financial future starts here."}</h2>
        <div class="auth-sub">${login ? "Log in to continue to your personal finance companion." : "Create your free Finora account."}</div>
        <div id="auth-error"></div>
        ${!login ? `<div class="auth-field"><label>Full Name</label><input class="input" id="name" required placeholder="Anusiya R"></div>` : ""}
        <div class="auth-field"><label>Email</label><input class="input" id="email" type="email" required placeholder="you@example.com"></div>
        <div class="auth-field"><label>Password</label><input class="input" id="password" type="password" required minlength="6" placeholder="••••••••"></div>
        ${!login ? `<div class="auth-field"><label>Confirm Password</label><input class="input" id="confirm" type="password" required minlength="6" placeholder="••••••••"></div>` : `<label style="display:flex;gap:8px;align-items:center;color:#7773a5;font-size:12px;margin:6px 0 18px"><input type="checkbox" checked> Remember me</label>`}
        <button class="primary-btn auth-submit">${login ? "Login" : "Sign Up"}</button>
        <div class="auth-link">${login ? `Don't have an account? <button type="button" id="switch-auth">Sign Up</button>` : `Already have an account? <button type="button" id="switch-auth">Login</button>`}</div>
      </form>
    </section>
  </div>`;

  document.getElementById("switch-auth").onclick = () => {
    location.hash = login ? "register" : "login";
    render();
  };

  document.getElementById("theme-btn").onclick = () => {
    document.body.classList.toggle("dark");
  };

  document.getElementById("auth-form").onsubmit = async (e) => {
    e.preventDefault();
    const error = document.getElementById("auth-error");
    error.innerHTML = "";
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    if(!login && password !== document.getElementById("confirm").value){
      error.innerHTML = `<div class="error-box">Passwords do not match.</div>`;
      return;
    }
    try{
      const payload = login ? {email,password} : {
        name: document.getElementById("name").value.trim(), email, password
      };
      const data = await api(login ? "/api/auth/login" : "/api/auth/register", {
        method:"POST", body:JSON.stringify(payload)
      });
      state.token = data.token; state.user = data.user;
      localStorage.setItem("finora_token", state.token);
      localStorage.setItem("finora_user", JSON.stringify(state.user));
      await loadAll();
      location.hash = "dashboard";
      render();
      toast(login ? "Welcome back!" : "Account created successfully!");
    }catch(err){
      error.innerHTML = `<div class="error-box">${esc(err.message)}</div>`;
    }
  };
}

function shell(content){
  const nav = [
    ["dashboard","⌂","Dashboard"],
    ["transactions","▤","Transactions"],
    ["ai","✦","AI Finance"],
    ["budget","◫","Budget"],
    ["savings","◎","Savings"],
    ["analytics","⌁","Analytics"],
    ["profile","♙","Profile"],
  ];
  const current = state.route;
  return `
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand"><div class="brand-icon">F</div><span>Finora AI</span></div>
      <nav class="nav">
        ${nav.map(([r,ic,label])=>`<button class="${current===r?"active":""}" data-route="${r}"><span class="nav-icon">${ic}</span><span>${label}</span></button>`).join("")}
      </nav>
      <div class="sidebar-bottom">
        <div class="user-mini">
          <div class="avatar">${initials(state.user?.name)}</div>
          <div><strong>${esc(state.user?.name || "User")}</strong><small>${esc(state.user?.email || "")}</small></div>
        </div>
        <button class="danger-btn" style="width:100%;margin-top:10px" id="logout-btn">Logout</button>
      </div>
    </aside>
    <main class="main">
      <div class="topbar">
        <div>
          <h1>${pageTitle(current)}</h1>
          <p>${pageSubtitle(current)}</p>
        </div>
        <div class="top-actions">
          <button class="icon-btn" id="refresh-btn">↻</button>
          <button class="icon-btn" id="open-ai-btn">✦</button>
          <button class="primary-btn" id="quick-add-btn">＋ Add</button>
        </div>
      </div>
      ${content}
    </main>
    ${floatingAI()}
    <div id="modal-root"></div>
  </div>`;
}

function pageTitle(route){
  return ({dashboard:"Good Morning, "+(state.user?.name?.split(" ")[0]||"there")+"! 🌸",transactions:"Transactions",ai:"AI Finance",budget:"Budget",savings:"Savings Goals",analytics:"Analytics",profile:"Profile"})[route] || "Finora AI";
}
function pageSubtitle(route){
  return ({dashboard:"Here's your personal financial overview for today.",transactions:"Track every rupee and keep your spending organized.",ai:"Your smart money assistant, powered by your own Finora data.",budget:"Plan category limits and monitor your budget health.",savings:"Build goals and celebrate your progress.",analytics:"Understand your spending patterns and trends.",profile:"Manage your personal and financial information."})[route] || "";
}

function dashboardView(){
  const d = state.dashboard || {};
  const f = d.financial || {};
  const cats = d.categories || [];
  const weekly = d.weekly || [];
  const goals = d.goals || [];
  return `
  <div class="grid grid-4">
    ${metric("💼","Available Balance",money(f.balance), "Updated from your transactions")}
    ${metric("🌸","Spent This Month",money(f.spending), "Personal spending total", "negative")}
    ${metric("🐷","Savings Target",money(f.savings), "Your current target")}
    ${metric("🎯","Budget Remaining",money(f.budget_remaining), "Available before budget is exhausted")}
  </div>

  <div class="grid grid-2 section-space">
    <div class="card insight-card">
      <div class="insight-copy">
        <span class="badge">✦ Finora AI Insight</span>
        <h2 style="font-size:22px;margin:16px 0 8px">Your financial picture is getting clearer.</h2>
        <p>${esc(d.insight || "")}</p>
        <button class="primary-btn" onclick="location.hash='ai'">View AI Analysis</button>
      </div>
    </div>
    <div class="card">
      <div class="card-title"><h2>Financial Health Score</h2><span class="badge">${f.health_score || 0}/100</span></div>
      <div style="font-size:42px;font-weight:800;font-family:'Plus Jakarta Sans';">${f.health_score || 0}</div>
      <div class="progress" style="margin:14px 0"><span style="width:${f.health_score||0}%"></span></div>
      <p class="muted" style="font-size:12px;line-height:1.6">Score is based on your spending, budget usage, savings target and account activity.</p>
    </div>
  </div>

  <div class="grid grid-2 section-space">
    <div class="card chart">
      <div class="card-title"><h2>Spending Overview</h2><span class="badge">Last 7 days</span></div>
      <div class="bar-chart">
        ${weekly.map(x=>`<div class="bar-wrap"><div class="bar" style="height:${Math.max(5,Math.min(100,(x.value/Math.max(...weekly.map(y=>y.value),1))*100))}%"></div><span class="bar-label">${x.label}</span></div>`).join("")}
      </div>
    </div>
    <div class="card chart">
      <div class="card-title"><h2>Spending by Category</h2><span class="badge">This period</span></div>
      ${cats.length ? `<div class="donut-wrap"><div class="donut"></div><div class="legend">${cats.slice(0,6).map((x,i)=>`<div class="legend-row"><span><i class="dot" style="background:${["#7b4fff","#ff6b91","#ffb332","#49c89a","#59a8ff","#9b6cff"][i]}"></i>${esc(x.name)}</span><strong>${x.percent}%</strong></div>`).join("")}</div></div>` : emptyInline("No spending categories yet.")}
    </div>
  </div>

  <div class="grid grid-2 section-space">
    <div class="card">
      <div class="card-title"><h2>Budget Status</h2><button class="ghost-btn" onclick="location.hash='budget'">Manage</button></div>
      ${(d.budgets||[]).length ? (d.budgets||[]).slice(0,5).map(b=>budgetRow(b)).join("") : emptyInline("Create a category budget to start tracking it.")}
    </div>
    <div class="card">
      <div class="card-title"><h2>Savings Progress</h2><button class="ghost-btn" onclick="location.hash='savings'">Goals</button></div>
      ${goals.length ? goals.slice(0,4).map(g=>goalRow(g)).join("") : emptyInline("Create your first savings goal.")}
    </div>
  </div>`;
}

function metric(icon,label,value,sub,cls=""){
  return `<div class="card metric"><div class="metric-label">${icon} ${label}</div><div class="metric-value">${value}</div><div class="metric-change ${cls}">${sub}</div></div>`;
}
function budgetRow(b){
  const pct = b.amount ? Math.min(100,Math.round((b.spent/b.amount)*100)) : 0;
  return `<div class="progress-row"><div class="progress-head"><span>${esc(b.category)}</span><span>${money(b.spent)} / ${money(b.amount)}</span></div><div class="progress"><span style="width:${pct}%"></span></div></div>`;
}
function goalRow(g){
  return `<div class="progress-row"><div class="progress-head"><span>${esc(g.name)}</span><span>${g.progress}%</span></div><div class="progress"><span style="width:${g.progress}%"></span></div><div class="muted" style="font-size:10px">${money(g.saved)} saved of ${money(g.target)}</div></div>`;
}
function emptyInline(text){ return `<div class="empty-state" style="padding:35px 10px"><div class="empty-icon">✦</div><div style="font-size:12px">${text}</div></div>`; }

function transactionsView(){
  return `
  <div class="card">
    <div class="filters">
      <input class="input" id="tx-search" placeholder="Search transactions...">
      <div class="tabs" id="tx-tabs">
        <button class="tab active" data-filter="all">All</button>
        <button class="tab" data-filter="expense">Expense</button>
        <button class="tab" data-filter="income">Income</button>
      </div>
      <button class="primary-btn" id="add-expense">＋ Add Expense</button>
    </div>
    <div class="table-wrap">
      <table><thead><tr><th>Transaction</th><th>Category</th><th>Method</th><th>Date</th><th>Amount</th><th></th></tr></thead>
      <tbody id="tx-body"></tbody></table>
    </div>
  </div>`;
}

function renderTransactions(list=state.transactions, filter="all", search=""){
  const body = document.getElementById("tx-body");
  if(!body) return;
  const rows = list.filter(t=>(filter==="all"||t.type===filter) && JSON.stringify(t).toLowerCase().includes(search.toLowerCase()));
  body.innerHTML = rows.length ? rows.map(t=>`
    <tr>
      <td><span class="tx-icon">${t.type==="income"?"💰":"🧾"}</span><span class="tx-name">${esc(t.description||t.merchant||"Transaction")}</span><div class="tx-sub">${esc(t.merchant||"Personal")}</div></td>
      <td>${esc(t.category)}</td><td>${esc(t.payment_method)}</td><td>${esc(t.date||"")}</td>
      <td class="${t.type==="income"?"amount-income":"amount-expense"}">${t.type==="income"?"+":"-"}${money(t.amount)}</td>
      <td><button class="icon-btn" style="width:34px;height:34px" onclick="deleteTx(${t.id})">×</button></td>
    </tr>`).join("") : `<tr><td colspan="6">${emptyInline("No transactions found.")}</td></tr>`;
}

async function deleteTx(id){
  if(!confirm("Delete this transaction?")) return;
  try{ await api(`/api/transactions/${id}`,{method:"DELETE"}); await loadAll(); render(); toast("Transaction deleted"); }catch(e){toast(e.message,"error")}
}

function aiView(){
  return `
  <div class="ai-page">
    <section class="card ai-chat-card">
      <div class="ai-head">
        <div class="ai-brand"><div class="bot">🤖</div><div><h2>AI Finance Bot</h2><small>Your personal money assistant</small></div></div>
        <button class="ghost-btn" id="clear-chat">Clear chat</button>
      </div>
      <div class="messages" id="ai-messages"></div>
      <div class="composer">
        <div class="composer-row"><input class="input" id="ai-input" placeholder="Ask anything about your finance..."><button class="send" id="ai-send">➤</button></div>
        <div class="suggestions">
          ${["How much did I spend?","Where am I spending the most?","How can I save more?","Give me a financial summary"].map(q=>`<button class="suggestion" data-q="${q}">${q}</button>`).join("")}
        </div>
      </div>
    </section>
    <aside class="grid" style="align-content:start">
      <div class="card">
        <div class="card-title"><h2>My Financial Context</h2></div>
        ${financialMini()}
      </div>
      <div class="card">
        <div class="card-title"><h2>Try asking</h2></div>
        <div style="display:grid;gap:8px">${["Can I afford a ₹5,000 purchase?","What is my biggest expense?","Explain my budget","How are my savings goals going?"].map(q=>`<button class="ghost-btn ask-side" data-q="${q}" style="text-align:left">${q}</button>`).join("")}</div>
      </div>
    </aside>
  </div>`;
}

function financialMini(){
  const f=state.dashboard?.financial||{};
  return `<div class="info-list">
    <div class="info-item"><span>Income</span><span>${money(f.income)}</span></div>
    <div class="info-item"><span>Spent</span><span>${money(f.spending)}</span></div>
    <div class="info-item"><span>Balance</span><span>${money(f.balance)}</span></div>
    <div class="info-item"><span>Savings target</span><span>${money(f.savings)}</span></div>
    <div class="info-item"><span>Health score</span><span>${f.health_score}/100</span></div>
  </div>`;
}

function renderMessages(containerId="ai-messages"){
  const el=document.getElementById(containerId); if(!el)return;
  if(!state.chat.length){
    el.innerHTML=`<div class="empty-state"><div class="empty-icon">🤖</div><h2>Hi ${esc(state.user?.name?.split(" ")[0]||"there")}!</h2><div>Ask me anything about your personal Finora finances.</div></div>`;
    return;
  }
  el.innerHTML=state.chat.map(m=>`<div class="message ${m.role==="user"?"user":"assistant"}"><div class="${m.role==="user"?"avatar":"bot"}">${m.role==="user"?initials(state.user?.name):"🤖"}</div><div><div class="bubble">${esc(m.message).replace(/\n/g,"<br>")}</div><div class="msg-time">${new Date(m.created_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</div></div></div>`).join("");
  el.scrollTop=el.scrollHeight;
}

async function sendAI(inputId="ai-input", containerId="ai-messages"){
  const input=document.getElementById(inputId); if(!input)return;
  const message=input.value.trim(); if(!message)return;
  input.value="";
  state.chat.push({role:"user",message,created_at:new Date().toISOString()});
  renderMessages(containerId);
  try{
    const data=await api("/api/ai/chat",{method:"POST",body:JSON.stringify({message})});
    state.chat.push({role:"assistant",message:data.reply,created_at:new Date().toISOString()});
    renderMessages(containerId);
  }catch(e){
    state.chat.push({role:"assistant",message:"I couldn't process that right now. Please try again.",created_at:new Date().toISOString()});
    renderMessages(containerId);
    toast(e.message,"error");
  }
}

function budgetView(){
  return `
  <div class="grid grid-2">
    <div class="card">
      <div class="card-title"><h2>Category Budgets</h2><button class="primary-btn" id="new-budget">＋ Add Budget</button></div>
      ${state.budgets.length ? state.budgets.map(b=>budgetRow(b)+`<div class="muted" style="font-size:10px;margin-bottom:8px">${money(b.remaining)} remaining</div>`).join("") : emptyInline("No budgets yet.")}
    </div>
    <div class="card">
      <div class="card-title"><h2>Budget Analytics</h2></div>
      <div class="metric-label">Total budget</div>
      <div class="metric-value">${money(state.budgets.reduce((a,b)=>a+b.amount,0))}</div>
      <p class="muted" style="font-size:12px">Track each category against its planned monthly limit.</p>
    </div>
  </div>`;
}

function savingsView(){
  return `<div class="grid grid-2"><div class="card"><div class="card-title"><h2>Your Goals</h2><button class="primary-btn" id="new-goal">＋ New Goal</button></div>${state.goals.length?state.goals.map(g=>`<div style="padding:15px 0;border-bottom:1px solid #eee8fa"><div class="progress-head"><span>${esc(g.name)}</span><span>${g.progress}%</span></div><div class="progress" style="margin:9px 0"><span style="width:${g.progress}%"></span></div><div class="muted" style="font-size:11px">${money(g.saved)} / ${money(g.target)} ${g.deadline?`• deadline ${g.deadline}`:""}</div></div>`).join(""):emptyInline("Create a goal and start building your future.")}</div><div class="card"><div class="card-title"><h2>Milestones</h2></div><div class="grid grid-2">${[25,50,75,100].map(x=>`<div style="padding:18px;border:1px solid var(--line);border-radius:18px;text-align:center"><div style="font-size:26px">${x===100?"🏆":"⭐"}</div><strong>${x}%</strong><div class="muted" style="font-size:10px">Goal milestone</div></div>`).join("")}</div></div></div>`;
}

function analyticsView(){
  const d=state.dashboard||{};
  return `<div class="grid grid-2"><div class="card chart"><div class="card-title"><h2>Weekly Trend</h2></div><div class="bar-chart">${(d.weekly||[]).map(x=>`<div class="bar-wrap"><div class="bar" style="height:${Math.max(5,Math.min(100,(x.value/Math.max(...(d.weekly||[]).map(y=>y.value),1))*100))}%"></div><span class="bar-label">${x.label}</span></div>`).join("")}</div></div><div class="card"><div class="card-title"><h2>Categories</h2></div>${(d.categories||[]).map((x,i)=>budgetRow({category:x.name,spent:x.value,amount:Math.max(x.value,1)*100})).join("")||emptyInline("No analytics yet.")}</div></div><div class="card section-space"><div class="card-title"><h2>Payment Methods</h2></div>${(d.payment_methods||[]).map(x=>`<div class="info-item"><span>${esc(x.name)}</span><span>${money(x.value)}</span></div>`).join("")||emptyInline("No payment data yet.")}</div>`;
}

function profileView(){
  const u=state.user||{};
  return `<div class="grid grid-2"><div class="card profile-card"><div class="profile-avatar">${initials(u.name)}</div><div><h2 style="margin:0 0 6px">${esc(u.name)}</h2><div class="muted">${esc(u.email)}</div><span class="badge" style="margin-top:10px">✦ Finora User</span></div></div><div class="card"><div class="card-title"><h2>Personal Information</h2></div><div class="info-list"><div class="info-item"><span>Name</span><span>${esc(u.name)}</span></div><div class="info-item"><span>Email</span><span>${esc(u.email)}</span></div><div class="info-item"><span>Monthly income</span><span>${money(u.monthly_income)}</span></div><div class="info-item"><span>Savings target</span><span>${money(u.savings_target)}</span></div></div><button class="primary-btn" id="edit-profile" style="margin-top:16px">Edit Financial Information</button></div><div class="card"><div class="card-title"><h2>Preferences</h2></div><div class="info-item"><span>Notifications</span><span>Enabled</span></div><div class="info-item"><span>AI personalization</span><span>My data only</span></div><div class="info-item"><span>Security</span><span>JWT protected</span></div></div></div>`;
}

function floatingAI(){
  return `<div class="floating-ai"><div id="floating-panel" style="display:${state.floatingOpen?"flex":"none"}" class="floating-panel"><div class="ai-head"><div class="ai-brand"><div class="bot">🤖</div><div><h2>AI Finance Bot</h2><small>Uses your Finora data</small></div></div><button class="icon-btn" id="close-floating">×</button></div><div class="messages" id="floating-messages"></div><div class="composer"><div class="composer-row"><input class="input" id="floating-input" placeholder="Ask about your finance..."><button class="send" id="floating-send">➤</button></div></div></div><button class="ai-fab" id="floating-btn">🤖</button></div>`;
}

function render(){
  state.route = location.hash.replace("#","") || (state.token?"dashboard":"login");
  if(!state.token && !["login","register"].includes(state.route)){
    location.hash="login"; return authPage("login");
  }
  if(state.token && ["login","register"].includes(state.route)){
    location.hash="dashboard"; return;
  }
  if(!state.token) return authPage(state.route);

  let content = "";
  if(state.route==="dashboard") content=dashboardView();
  if(state.route==="transactions") content=transactionsView();
  if(state.route==="ai") content=aiView();
  if(state.route==="budget") content=budgetView();
  if(state.route==="savings") content=savingsView();
  if(state.route==="analytics") content=analyticsView();
  if(state.route==="profile") content=profileView();
  app.innerHTML = shell(content);
  bindShell();
  if(state.route==="transactions") bindTransactions();
  if(state.route==="ai") bindAI();
  if(state.route==="budget") bindBudget();
  if(state.route==="savings") bindSavings();
  if(state.route==="profile") bindProfile();
}

function bindShell(){
  document.querySelectorAll("[data-route]").forEach(b=>b.onclick=()=>{location.hash=b.dataset.route});
  document.getElementById("logout-btn").onclick=()=>logout();
  document.getElementById("refresh-btn").onclick=async()=>{await loadAll();render();toast("Data refreshed")};
  document.getElementById("open-ai-btn").onclick=()=>{state.floatingOpen=true;render()};
  document.getElementById("quick-add-btn").onclick=()=>openTransactionModal();
  document.getElementById("floating-btn").onclick=()=>{state.floatingOpen=!state.floatingOpen;render()};
  const close=document.getElementById("close-floating"); if(close) close.onclick=()=>{state.floatingOpen=false;render()};
  if(state.floatingOpen){
    renderMessages("floating-messages");
    document.getElementById("floating-send").onclick=()=>sendAI("floating-input","floating-messages");
    document.getElementById("floating-input").onkeydown=e=>{if(e.key==="Enter")sendAI("floating-input","floating-messages")};
  }
}

function bindTransactions(){
  let filter="all",search="";
  renderTransactions();
  document.getElementById("tx-search").oninput=e=>{search=e.target.value;renderTransactions(state.transactions,filter,search)};
  document.querySelectorAll("#tx-tabs .tab").forEach(b=>b.onclick=()=>{document.querySelectorAll("#tx-tabs .tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");filter=b.dataset.filter;renderTransactions(state.transactions,filter,search)});
  document.getElementById("add-expense").onclick=()=>openTransactionModal("expense");
}

function bindAI(){
  renderMessages();
  document.getElementById("ai-send").onclick=()=>sendAI();
  document.getElementById("ai-input").onkeydown=e=>{if(e.key==="Enter")sendAI()};
  document.querySelectorAll(".suggestion,.ask-side").forEach(b=>b.onclick=()=>{document.getElementById("ai-input").value=b.dataset.q;sendAI()});
  document.getElementById("clear-chat").onclick=async()=>{await api("/api/ai/clear",{method:"POST"});state.chat=[];renderMessages();toast("Chat cleared")};
}

function bindBudget(){ document.getElementById("new-budget")?.addEventListener("click",()=>openBudgetModal()); }
function bindSavings(){ document.getElementById("new-goal")?.addEventListener("click",()=>openGoalModal()); }
function bindProfile(){ document.getElementById("edit-profile")?.addEventListener("click",()=>openProfileModal()); }

function modal(title, body){
  document.getElementById("modal-root").innerHTML=`<div class="modal-backdrop" id="backdrop"><div class="modal"><div class="modal-head"><h2>${title}</h2><button class="icon-btn" id="close-modal">×</button></div>${body}</div></div>`;
  document.getElementById("close-modal").onclick=()=>document.getElementById("modal-root").innerHTML="";
  document.getElementById("backdrop").onclick=e=>{if(e.target.id==="backdrop")document.getElementById("modal-root").innerHTML=""};
}

function openTransactionModal(type="expense"){
  modal(type==="income"?"Add Income":"Add Expense",`
  <form id="tx-form"><div class="form-grid">
    <div class="field"><label>Amount</label><input class="input" id="m-amount" type="number" min="1" required placeholder="450"></div>
    <div class="field"><label>Type</label><select class="select" id="m-type"><option value="expense">Expense</option><option value="income">Income</option></select></div>
    <div class="field"><label>Category</label><select class="select" id="m-category">${["Food","Transport","Shopping","Education","Entertainment","Salary","Other"].map(x=>`<option>${x}</option>`).join("")}</select></div>
    <div class="field"><label>Payment Method</label><select class="select" id="m-method"><option>UPI</option><option>Card</option><option>Cash</option><option>Bank</option></select></div>
  </div><div class="field" style="margin-top:14px"><label>Description</label><input class="input" id="m-description" placeholder="Dinner at Zomato"></div><div class="field" style="margin-top:14px"><label>Date</label><input class="input" id="m-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div><div class="form-actions"><button type="button" class="ghost-btn" id="cancel-m">Cancel</button><button class="primary-btn">Save Transaction</button></div></form>`);
  document.getElementById("m-type").value=type;
  document.getElementById("cancel-m").onclick=()=>document.getElementById("modal-root").innerHTML="";
  document.getElementById("tx-form").onsubmit=async e=>{
    e.preventDefault();
    try{
      await api("/api/transactions",{method:"POST",body:JSON.stringify({
        amount:document.getElementById("m-amount").value,
        type:document.getElementById("m-type").value,
        category:document.getElementById("m-category").value,
        payment_method:document.getElementById("m-method").value,
        description:document.getElementById("m-description").value,
        date:document.getElementById("m-date").value
      })});
      document.getElementById("modal-root").innerHTML="";
      await loadAll();render();toast("Transaction added");
    }catch(err){toast(err.message,"error")}
  };
}

function openBudgetModal(){
  modal("Create Category Budget",`<form id="budget-form"><div class="field"><label>Category</label><select class="select" id="b-cat">${["Food","Transport","Shopping","Education","Entertainment","Other"].map(x=>`<option>${x}</option>`).join("")}</select></div><div class="field" style="margin-top:14px"><label>Monthly Limit</label><input class="input" id="b-amount" type="number" min="0" required placeholder="5000"></div><div class="form-actions"><button class="primary-btn">Save Budget</button></div></form>`);
  document.getElementById("budget-form").onsubmit=async e=>{e.preventDefault();try{await api("/api/budgets",{method:"POST",body:JSON.stringify({category:document.getElementById("b-cat").value,amount:document.getElementById("b-amount").value})});document.getElementById("modal-root").innerHTML="";await loadAll();render();toast("Budget saved")}catch(err){toast(err.message,"error")}};
}

function openGoalModal(){
  modal("Create Savings Goal",`<form id="goal-form"><div class="field"><label>Goal name</label><input class="input" id="g-name" required placeholder="Buy Headphones"></div><div class="form-grid" style="margin-top:14px"><div class="field"><label>Target</label><input class="input" id="g-target" type="number" min="0" required></div><div class="field"><label>Already saved</label><input class="input" id="g-saved" type="number" min="0" value="0"></div></div><div class="field" style="margin-top:14px"><label>Deadline</label><input class="input" id="g-date" type="date"></div><div class="form-actions"><button class="primary-btn">Create Goal</button></div></form>`);
  document.getElementById("goal-form").onsubmit=async e=>{e.preventDefault();try{await api("/api/goals",{method:"POST",body:JSON.stringify({name:document.getElementById("g-name").value,target:document.getElementById("g-target").value,saved:document.getElementById("g-saved").value,deadline:document.getElementById("g-date").value})});document.getElementById("modal-root").innerHTML="";await loadAll();render();toast("Goal created")}catch(err){toast(err.message,"error")}};
}

function openProfileModal(){
  const u=state.user||{};
  modal("Update Financial Information",`<form id="profile-form"><div class="field"><label>Name</label><input class="input" id="p-name" value="${esc(u.name)}"></div><div class="form-grid" style="margin-top:14px"><div class="field"><label>Monthly Income</label><input class="input" id="p-income" type="number" value="${u.monthly_income||0}"></div><div class="field"><label>Savings Target</label><input class="input" id="p-savings" type="number" value="${u.savings_target||0}"></div></div><div class="form-actions"><button class="primary-btn">Save Changes</button></div></form>`);
  document.getElementById("profile-form").onsubmit=async e=>{e.preventDefault();try{const data=await api("/api/auth/profile",{method:"PUT",body:JSON.stringify({name:document.getElementById("p-name").value,monthly_income:document.getElementById("p-income").value,savings_target:document.getElementById("p-savings").value})});state.user=data.user;localStorage.setItem("finora_user",JSON.stringify(state.user));document.getElementById("modal-root").innerHTML="";await loadAll();render();toast("Profile updated")}catch(err){toast(err.message,"error")}};
}

window.addEventListener("hashchange",()=>{state.route=location.hash.replace("#","")||"dashboard";render()});

(async function boot(){
  if(state.token){
    try{await loadAll();}catch{}
  }
  render();
})();
