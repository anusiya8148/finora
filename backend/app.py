import os, re, uuid
from datetime import datetime, timedelta
from collections import defaultdict
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash, check_password_hash
import jwt
from database import db
from models import User, Transaction, Budget, Goal, ChatMessage

load_dotenv()
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(os.path.dirname(BASE_DIR), "frontend")

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="/static")
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "finora-dev-secret-2026")
app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL", "sqlite:///finora.db")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
CORS(app, resources={r"/api/*": {"origins": "*"}})
db.init_app(app)

with app.app_context():
    db.create_all()

DEMO_EMAIL = "anusiya8148@gmail.com"

def user_json(u):
    return {"id": u.id, "name": u.name, "email": u.email,
            "monthly_income": u.monthly_income or 0,
            "savings_target": u.savings_target or 0}

def tx_json(t):
    return {"id": t.id, "amount": t.amount, "type": t.type,
            "category": t.category, "description": t.description or "",
            "merchant": t.merchant or "", "payment_method": t.payment_method or "UPI",
            "date": t.date.isoformat() if t.date else None}

def budget_json(b):
    return {"id": b.id, "category": b.category, "amount": b.amount,
            "spent": b.spent, "remaining": max(b.amount-b.spent, 0)}

def goal_json(g):
    progress = round((g.saved/g.target)*100) if g.target else 0
    return {"id": g.id, "name": g.name, "target": g.target,
            "saved": g.saved, "deadline": g.deadline.isoformat() if g.deadline else None,
            "progress": min(progress, 100)}

def token_for(uid):
    # PyJWT 2.10+ requires the JWT `sub` claim to be a string.
    return jwt.encode({"sub": str(uid), "exp": datetime.utcnow()+timedelta(days=7)},
                      app.config["SECRET_KEY"], algorithm="HS256")

def current_user():
    h = request.headers.get("Authorization", "")
    if not h.startswith("Bearer "):
        return None
    try:
        payload = jwt.decode(h[7:], app.config["SECRET_KEY"], algorithms=["HS256"])
        return db.session.get(User, int(payload["sub"]))
    except Exception:
        return None

def require_user():
    u = current_user()
    if not u:
        return None, (jsonify(success=False, message="Authentication required."), 401)
    return u, None

def dashboard_data(user):
    rows = Transaction.query.filter_by(user_id=user.id).all()
    income_tx = sum(x.amount for x in rows if x.type == "income")
    spending = sum(x.amount for x in rows if x.type != "income")
    income = user.monthly_income or income_tx
    balance = max(income + income_tx - spending, 0) if user.monthly_income else max(income_tx-spending,0)

    categories = defaultdict(float)
    methods = defaultdict(float)
    for x in rows:
        if x.type != "income":
            categories[x.category] += x.amount
            methods[x.payment_method or "UPI"] += x.amount

    palette = ["#8055f6","#ff6b91","#ffb42e","#4cc9a5","#59a8ff","#9b6cff"]
    total = max(spending, 1)
    cats = [{"name": k, "value": round(v,2), "percent": round(v/total*100),
             "color": palette[i%len(palette)]}
            for i,(k,v) in enumerate(sorted(categories.items(), key=lambda p:p[1], reverse=True)[:6])]

    today = datetime.utcnow().date()
    weekly = []
    for i in range(6,-1,-1):
        d = today - timedelta(days=i)
        value = sum(x.amount for x in rows if x.type != "income" and x.date and x.date.date() == d)
        weekly.append({"label": d.strftime("%a"), "value": round(value,2)})

    budgets = Budget.query.filter_by(user_id=user.id).all()
    for b in budgets:
        b.spent = round(sum(x.amount for x in rows if x.type != "income" and x.category == b.category), 2)
    db.session.commit()

    budget_total = sum(b.amount for b in budgets)
    budget_spent = sum(b.spent for b in budgets)
    budget_remaining = max(budget_total-budget_spent, 0) if budgets else max(income-spending,0)
    savings = user.savings_target or 0
    savings_progress = 0
    goals = Goal.query.filter_by(user_id=user.id).all()
    if goals:
        savings_progress = round(sum(g.saved for g in goals)/max(sum(g.target for g in goals),1)*100)
    elif savings:
        savings_progress = 0

    score = 50
    if income > 0: score += min(20, round(max(income-spending,0)/income*20))
    if spending <= income*0.6 if income else True: score += 15
    if savings > 0 or goals: score += 15
    score = min(100, score)

    insight = ("Add your first transaction and Finora AI will start analyzing your spending."
               if not rows else
               f"You have spent {money(spending)} so far. Review your top categories and keep your savings goal on track.")

    return {"user": user_json(user),
            "financial": {"balance": balance, "income": income, "spending": spending,
                          "savings": savings, "budget_remaining": budget_remaining,
                          "health_score": score},
            "categories": cats, "weekly": weekly,
            "budgets": [budget_json(x) for x in budgets],
            "goals": [goal_json(x) for x in goals],
            "payment_methods": [{"name":k,"value":round(v,2)} for k,v in methods.items()],
            "insight": insight}

def money(n):
    return f"₹{n:,.0f}"

@app.get("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")

@app.get("/<path:path>")
def frontend_files(path):
    if os.path.isfile(os.path.join(FRONTEND_DIR, path)):
        return send_from_directory(FRONTEND_DIR, path)
    return send_from_directory(FRONTEND_DIR, "index.html")

@app.get("/api/health")
def health():
    return jsonify(success=True, status="healthy", service="Finora AI")

@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name","")).strip()
    email = str(data.get("email","")).strip().lower()
    password = str(data.get("password",""))
    if not name or not email or len(password) < 6:
        return jsonify(success=False, message="Name, email and a 6+ character password are required."), 400
    if User.query.filter_by(email=email).first():
        return jsonify(success=False, message="An account with this email already exists."), 409
    u = User(name=name, email=email, password_hash=generate_password_hash(password))
    db.session.add(u); db.session.commit()
    return jsonify(success=True, token=token_for(u.id), user=user_json(u)), 201

@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email","")).strip().lower()
    password = str(data.get("password",""))
    u = User.query.filter_by(email=email).first()
    if not u or not check_password_hash(u.password_hash, password):
        return jsonify(success=False, message="Invalid email or password."), 401
    return jsonify(success=True, token=token_for(u.id), user=user_json(u))

@app.get("/api/auth/profile")
def profile():
    u, err = require_user()
    if err: return err
    return jsonify(success=True, user=user_json(u))

@app.put("/api/auth/profile")
def update_profile():
    u, err = require_user()
    if err: return err
    data = request.get_json(silent=True) or {}
    if data.get("name"): u.name = str(data["name"]).strip()
    if data.get("monthly_income") is not None: u.monthly_income = float(data["monthly_income"])
    if data.get("savings_target") is not None: u.savings_target = float(data["savings_target"])
    db.session.commit()
    return jsonify(success=True, user=user_json(u))

@app.get("/api/dashboard")
def dashboard():
    u, err = require_user()
    if err: return err
    return jsonify(success=True, **dashboard_data(u))

@app.get("/api/transactions")
def transactions():
    u, err = require_user()
    if err: return err
    limit = max(1, min(int(request.args.get("limit",50)), 200))
    rows = Transaction.query.filter_by(user_id=u.id).order_by(Transaction.date.desc()).limit(limit).all()
    return jsonify(success=True, transactions=[tx_json(x) for x in rows])

@app.post("/api/transactions")
def create_transaction():
    u, err = require_user()
    if err: return err
    d = request.get_json(silent=True) or {}
    try: amount = float(d.get("amount",0))
    except: amount = 0
    if amount <= 0: return jsonify(success=False,message="Amount must be greater than zero."),400
    dt = datetime.utcnow()
    if d.get("date"):
        try: dt = datetime.fromisoformat(str(d["date"]))
        except: pass
    t = Transaction(user_id=u.id, amount=amount, type=d.get("type","expense"),
                    category=d.get("category","Other"), description=d.get("description",""),
                    merchant=d.get("merchant",""), payment_method=d.get("payment_method","UPI"),
                    date=dt)
    db.session.add(t); db.session.commit()
    return jsonify(success=True, transaction=tx_json(t)),201

@app.delete("/api/transactions/<int:tid>")
def delete_transaction(tid):
    u, err = require_user()
    if err: return err
    t = Transaction.query.filter_by(id=tid,user_id=u.id).first()
    if not t: return jsonify(success=False,message="Transaction not found."),404
    db.session.delete(t); db.session.commit()
    return jsonify(success=True)

@app.get("/api/budgets")
def budgets():
    u, err = require_user()
    if err: return err
    data = dashboard_data(u)
    return jsonify(success=True,budgets=data["budgets"])

@app.post("/api/budgets")
def create_budget():
    u, err = require_user()
    if err: return err
    d = request.get_json(silent=True) or {}
    try: amount=float(d.get("amount",0))
    except: amount=0
    if amount <= 0: return jsonify(success=False,message="Budget amount must be greater than zero."),400
    b=Budget(user_id=u.id,category=str(d.get("category","Other")),amount=amount,spent=0)
    db.session.add(b); db.session.commit()
    return jsonify(success=True,budget=budget_json(b)),201

@app.get("/api/goals")
def goals():
    u, err = require_user()
    if err: return err
    return jsonify(success=True,goals=[goal_json(x) for x in Goal.query.filter_by(user_id=u.id).all()])

@app.post("/api/goals")
def create_goal():
    u, err = require_user()
    if err: return err
    d=request.get_json(silent=True) or {}
    try: target=float(d.get("target",0)); saved=float(d.get("saved",0))
    except: target=saved=0
    if not d.get("name") or target <= 0:
        return jsonify(success=False,message="Goal name and target are required."),400
    deadline=None
    if d.get("deadline"):
        try: deadline=datetime.fromisoformat(str(d["deadline"])).date()
        except: pass
    g=Goal(user_id=u.id,name=str(d["name"]),target=target,saved=saved,deadline=deadline)
    db.session.add(g); db.session.commit()
    return jsonify(success=True,goal=goal_json(g)),201

@app.get("/api/ai/history")
def ai_history():
    u, err = require_user()
    if err: return err
    rows=ChatMessage.query.filter_by(user_id=u.id).order_by(ChatMessage.created_at.asc()).all()
    return jsonify(success=True,messages=[{"id":x.id,"role":x.role,"message":x.message,
                                           "created_at":x.created_at.isoformat()} for x in rows])

@app.post("/api/ai/clear")
def ai_clear():
    u, err = require_user()
    if err: return err
    ChatMessage.query.filter_by(user_id=u.id).delete()
    db.session.commit()
    return jsonify(success=True)

def gemini_reply(message, context):
    key=os.getenv("GEMINI_API_KEY","").strip()
    if not key:
        return None
    try:
        from google import genai
        client=genai.Client(api_key=key)
        prompt=("You are Finora AI, a personal finance assistant. Answer using ONLY the user's "
                "provided financial context. Do not invent transactions. Be concise and practical.\n"
                f"USER FINANCIAL CONTEXT:\n{context}\nQUESTION: {message}")
        r=client.models.generate_content(model=os.getenv("GEMINI_MODEL","gemini-2.5-flash"),contents=prompt)
        return getattr(r,"text",None)
    except Exception:
        return None

@app.post("/api/ai/chat")
def ai_chat():
    u, err = require_user()
    if err: return err
    d=request.get_json(silent=True) or {}
    message=str(d.get("message","")).strip()
    if not message: return jsonify(success=False,message="Message is required."),400
    p=dashboard_data(u); f=p["financial"]
    cats=", ".join(f'{x["name"]}: {money(x["value"])}' for x in p["categories"]) or "No expenses yet"
    context=f"Income: {money(f['income'])}; Spending: {money(f['spending'])}; Balance: {money(f['balance'])}; Savings target: {money(f['savings'])}; Budget remaining: {money(f['budget_remaining'])}; Categories: {cats}"
    reply=gemini_reply(message,context)
    if not reply:
        low=message.lower()
        if any(w in low for w in ["spend","spent","expense"]):
            reply=f"You have spent {money(f['spending'])} so far."
        elif "budget" in low:
            reply=f"Your estimated budget remaining is {money(f['budget_remaining'])}."
        elif "save" in low or "saving" in low:
            reply=f"Your savings target is {money(f['savings'])}. Your current balance is about {money(f['balance'])}."
        elif "afford" in low:
            nums=re.findall(r"\d+(?:\.\d+)?",message.replace(",",""))
            price=float(nums[0]) if nums else 0
            reply=f"Based on your current balance of {money(f['balance'])}, {'yes' if price and price <= f['balance'] else 'I would be cautious'}."
        else:
            reply=f"Your current balance is {money(f['balance'])}, with {money(f['spending'])} spent. I can help analyze your budget, savings and spending."
    db.session.add(ChatMessage(user_id=u.id,role="user",message=message))
    db.session.add(ChatMessage(user_id=u.id,role="assistant",message=reply))
    db.session.commit()
    return jsonify(success=True,reply=reply)

@app.post("/api/ai/parse-expense")
def parse_expense():
    u, err=require_user()
    if err:return err
    text=str((request.get_json(silent=True) or {}).get("text","")).strip()
    m=re.search(r"(\d+(?:\.\d+)?)",text)
    amount=float(m.group(1)) if m else None
    low=text.lower()
    category="Food" if any(x in low for x in ["food","dinner","lunch","zomato","swiggy"]) else "Shopping" if any(x in low for x in ["shop","amazon","myntra"]) else "Transport" if any(x in low for x in ["bus","uber","ola","travel"]) else "Other"
    return jsonify(success=True,parsed={"amount":amount,"category":category,"description":text,"payment_method":"UPI"})

@app.post("/api/ai/affordability")
def affordability():
    u, err=require_user()
    if err:return err
    d=request.get_json(silent=True) or {}
    price=float(d.get("amount",0) or d.get("price",0) or 0)
    f=dashboard_data(u)["financial"]
    return jsonify(success=True,affordable=price>0 and price<=f["balance"],remaining=max(f["balance"]-price,0))
@app.get("/")
def home():
    return send_from_directory(FRONTEND_DIR, "index.html")

@app.get("/static/<path:filename>")
def static_files(filename):
    return send_from_directory(FRONTEND_DIR, filename)

if __name__=="__main__":
    app.run(host="0.0.0.0",port=int(os.getenv("PORT","5000")),debug=True)
