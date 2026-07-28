import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")
if not DATABASE_URL or "[PROJECT_REF]" in DATABASE_URL or "abxzyhgaityhgwbltjwu" in DATABASE_URL or "placeholder" in DATABASE_URL or "invalid" in DATABASE_URL:
    DATABASE_URL = "sqlite:///./local_dev_fallback.db"

# Handle supabase postgres url pooling vs session if needed, but standard is fine
if DATABASE_URL.startswith("postgres://") and not DATABASE_URL.startswith("postgresql://"):
    # SQLAlchemy requires postgresql:// protocol
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL", "")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_ANON_KEY", "")

# OpenAI API Key for Whisper & Vision inspector
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
