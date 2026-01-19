#!/usr/bin/env python3
"""
Test database connection to verify credentials are set correctly.

Usage:
    python test_cases/test_db_connection.py
"""
import sys
import os
from pathlib import Path
from dotenv import load_dotenv

# Add parent directory to Python path
script_dir = Path(__file__).parent
parent_dir = script_dir.parent
sys.path.insert(0, str(parent_dir))

# Load .env - always look in parent_dir (python-service/)
try:
    env_path = parent_dir / '.env'
    if env_path.exists():
        load_dotenv(env_path, override=True)
        print(f"✅ Loaded .env from: {env_path}")
    else:
        # Fallback: try current directory
        load_dotenv(override=True)
except Exception as e:
    print(f"⚠️  Warning: Could not load .env: {e}")
    pass

def test_connection():
    """Test database connection."""
    print("=" * 60)
    print("🔍 Testing Database Connection")
    print("=" * 60)
    print()
    
    # Check environment variables
    print("📋 Checking Environment Variables...")
    print()
    
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
    db_host = os.getenv("DB_HOST", "")
    db_port = os.getenv("DB_PORT", "5432")
    db_user = os.getenv("DB_USER", "postgres")
    db_password = os.getenv("DB_PASSWORD", "")
    db_name = os.getenv("DB_NAME", "postgres")
    database_url = os.getenv("DATABASE_URL", "")
    
    # Auto-detect host from Supabase URL if not set
    if not db_host and supabase_url:
        if ".supabase.co" in supabase_url:
            project_ref = supabase_url.replace("https://", "").replace(".supabase.co", "")
            db_host = f"db.{project_ref}.supabase.co"
            print(f"✅ Auto-detected DB_HOST from Supabase URL: {db_host}")
        else:
            print(f"⚠️  Could not auto-detect DB_HOST from: {supabase_url}")
    elif db_host:
        print(f"✅ DB_HOST is set: {db_host}")
    else:
        print("❌ DB_HOST is not set")
    
    print(f"   Port: {db_port}")
    print(f"   User: {db_user}")
    print(f"   Database: {db_name}")
    
    if database_url:
        # Mask password in URL
        masked_url = database_url.split("@")[0].split(":")[-1] + "@" + "@".join(database_url.split("@")[1:]) if "@" in database_url else database_url
        print(f"✅ DATABASE_URL is set: {masked_url}")
        has_connection_string = True
    else:
        print("ℹ️  DATABASE_URL is not set (using individual credentials)")
        has_connection_string = False
    
    if db_password:
        print(f"✅ DB_PASSWORD is set (length: {len(db_password)} chars)")
        has_password = True
    else:
        print("❌ DB_PASSWORD is not set")
        has_password = False
    
    print()
    
    if not has_password and not has_connection_string:
        print("=" * 60)
        print("❌ Connection Test Failed")
        print("=" * 60)
        print()
        print("Missing required credentials!")
        print()
        print("To fix:")
        print("1. Get your database password from Supabase Dashboard:")
        print("   - Go to https://supabase.com/dashboard")
        print("   - Select your project")
        print("   - Go to Settings → Database")
        print("   - Copy the 'Database Password'")
        print()
        print("2. Add to .env file:")
        print(f"   DB_HOST={db_host or 'db.your-project.supabase.co'}")
        print(f"   DB_PORT={db_port}")
        print(f"   DB_USER={db_user}")
        print(f"   DB_PASSWORD=your_database_password_here")
        print(f"   DB_NAME={db_name}")
        print()
        print("See DATABASE_SETUP.md for detailed instructions.")
        return False
    
    # Try to connect
    print("=" * 60)
    print("🔌 Testing Connection...")
    print("=" * 60)
    print()
    
    try:
        import psycopg2
        
        if database_url:
            print("Trying connection via DATABASE_URL...")
            conn = psycopg2.connect(database_url, connect_timeout=10)
        else:
            print(f"Trying connection to {db_host}:{db_port}...")
            conn = psycopg2.connect(
                host=db_host,
                port=int(db_port),
                user=db_user,
                password=db_password,
                database=db_name,
                connect_timeout=10
            )
        
        # Test query
        cursor = conn.cursor()
        cursor.execute("SELECT version();")
        version = cursor.fetchone()[0]
        cursor.close()
        conn.close()
        
        print()
        print("=" * 60)
        print("✅ Connection Successful!")
        print("=" * 60)
        print()
        print(f"PostgreSQL Version: {version[:50]}...")
        print()
        print("Your database connection is configured correctly!")
        print("You can now run the agent with SQL queries.")
        return True
        
    except psycopg2.OperationalError as e:
        error_str = str(e)
        print()
        print("=" * 60)
        print("❌ Connection Failed")
        print("=" * 60)
        print()
        
        if "password authentication failed" in error_str.lower():
            print("Error: Password authentication failed")
            print()
            print("This means:")
            print("  - The connection details are correct")
            print("  - But the password is wrong")
            print()
            print("To fix:")
            print("1. Verify DB_PASSWORD in .env matches your Supabase database password")
            print("2. Get/reset password from Supabase Dashboard → Settings → Database")
            print("3. Make sure you're using the 'Database Password', not the service role key")
        elif "could not connect" in error_str.lower() or "timeout" in error_str.lower():
            print("Error: Could not connect to database")
            print()
            print("This means:")
            print("  - Network issue or wrong host/port")
            print()
            print("To fix:")
            print(f"1. Verify DB_HOST is correct: {db_host}")
            print(f"2. Verify DB_PORT is correct: {db_port}")
            print("3. Check if database is active in Supabase Dashboard")
            print("4. Check your network/firewall settings")
        else:
            print(f"Error: {error_str}")
        
        print()
        print("See DATABASE_SETUP.md for detailed troubleshooting.")
        return False
        
    except ImportError:
        print()
        print("=" * 60)
        print("❌ Missing Dependency")
        print("=" * 60)
        print()
        print("psycopg2 is not installed.")
        print()
        print("To fix:")
        print("  pip install psycopg2-binary")
        return False
        
    except Exception as e:
        print()
        print("=" * 60)
        print("❌ Unexpected Error")
        print("=" * 60)
        print()
        print(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = test_connection()
    sys.exit(0 if success else 1)
