from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from . import config

# Configure create_engine conditionally based on database type
if config.DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        config.DATABASE_URL,
        connect_args={"check_same_thread": False}
    )
else:
    # We use pool_pre_ping=True to prevent disconnect issues with Supabase (which kills idle connections)
    engine = create_engine(
        config.DATABASE_URL, 
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
