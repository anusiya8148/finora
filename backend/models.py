from datetime import datetime
from database import db

class User(db.Model):
    id=db.Column(db.Integer,primary_key=True)
    name=db.Column(db.String(120),nullable=False)
    email=db.Column(db.String(255),unique=True,nullable=False,index=True)
    password_hash=db.Column(db.String(255),nullable=False)
    monthly_income=db.Column(db.Float,default=0)
    savings_target=db.Column(db.Float,default=0)

class Transaction(db.Model):
    id=db.Column(db.Integer,primary_key=True)
    user_id=db.Column(db.Integer,db.ForeignKey("user.id"),nullable=False,index=True)
    amount=db.Column(db.Float,nullable=False)
    type=db.Column(db.String(20),default="expense")
    category=db.Column(db.String(80),default="Other")
    description=db.Column(db.String(255),default="")
    merchant=db.Column(db.String(120),default="")
    payment_method=db.Column(db.String(50),default="UPI")
    date=db.Column(db.DateTime,default=datetime.utcnow)

class Budget(db.Model):
    id=db.Column(db.Integer,primary_key=True)
    user_id=db.Column(db.Integer,db.ForeignKey("user.id"),nullable=False,index=True)
    category=db.Column(db.String(80),nullable=False)
    amount=db.Column(db.Float,nullable=False)
    spent=db.Column(db.Float,default=0)

class Goal(db.Model):
    id=db.Column(db.Integer,primary_key=True)
    user_id=db.Column(db.Integer,db.ForeignKey("user.id"),nullable=False,index=True)
    name=db.Column(db.String(120),nullable=False)
    target=db.Column(db.Float,nullable=False)
    saved=db.Column(db.Float,default=0)
    deadline=db.Column(db.Date,nullable=True)

class ChatMessage(db.Model):
    id=db.Column(db.Integer,primary_key=True)
    user_id=db.Column(db.Integer,db.ForeignKey("user.id"),nullable=False,index=True)
    role=db.Column(db.String(20),nullable=False)
    message=db.Column(db.Text,nullable=False)
    created_at=db.Column(db.DateTime,default=datetime.utcnow)
