#!/usr/bin/env python3
"""Quick test with the provided password."""
import sys
import os
from pathlib import Path

script_dir = Path(__file__).parent
parent_dir = script_dir.parent
sys.path.insert(0, str(parent_dir))

# Load .env if available
try:
    from dotenv import load_dotenv
    env_path = parent_dir / '.env'
    if env_path.exists():
        load_dotenv(env_path, override=True)
except ImportError:
    pass

# Set connection details (from env or defaults)
supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "https://rutcjpugsrfoobsrufnn.supabase.co")
password = os.getenv("DB_PASSWORD", "Notes9@UnitedStates")

# Auto-detect host
project_ref = supabase_url.replace("https://", "").replace(".supabase.co", "")
db_host = os.getenv("DB_HOST", f"db.{project_ref}.supabase.co")
db_port = int(os.getenv("DB_PORT", "5432"))
db_user = os.getenv("DB_USER", "postgres")
db_name = os.getenv("DB_NAME", "postgres")

print("=" * 60)
print("🔌 Testing Database Connection")
print("=" * 60)
print()
print(f"Host: {db_host}")
print(f"Port: {db_port}")
print(f"User: {db_user}")
print(f"Database: {db_name}")
print(f"Password: {'*' * len(password) if password else 'NOT SET'}")
print()

# First, verify credentials work via Supabase REST API (this works even if direct PostgreSQL is blocked)
print("Step 1: Verifying credentials via Supabase REST API...")
supabase_works = False
try:
    # Import websockets patch (applies automatically on import)
    try:
        from services.websockets_patch import *  # noqa: F401, F403
    except ImportError:
        pass
    
    from services.db import SupabaseService
    
    supabase_service = SupabaseService()
    # Try a simple query via REST API
    result = supabase_service.client.table("profiles").select("id").limit(1).execute()
    print("✅ Supabase REST API connection successful!")
    print("   Your credentials (URL + Service Role Key) are correct.")
    supabase_works = True
    print()
except Exception as e:
    error_msg = str(e)
    print(f"⚠️  Supabase REST API check failed: {error_msg[:150]}")
    if "SERVICE_ROLE_KEY" in error_msg or "service" in error_msg.lower():
        print("   Check your SUPABASE_SERVICE_ROLE_KEY in .env file")
    else:
        print("   This might indicate a configuration issue.")
    print()

print("Step 2: Testing direct PostgreSQL connection...")
try:
    import psycopg2
    
    # Try direct connection first (with SSL for Supabase)
    try:
        conn = psycopg2.connect(
            host=db_host,
            port=db_port,
            user=db_user,
            password=password,
            database=db_name,
            connect_timeout=15,  # Increased timeout
            sslmode='require'  # Supabase requires SSL
        )
        print("✅ Direct connection successful!")
    except psycopg2.OperationalError as e:
        error_str = str(e).lower()
        if "timeout" in error_str:
            print("❌ Direct connection timed out")
            print()
            print("⚠️  Trying connection pooler (port 6543) as alternative...")
            print()
            
            # Try connection pooler
            try:
                # Get pooler settings from env or try common format
                pooler_host = os.getenv("DB_POOLER_HOST")
                pooler_port = int(os.getenv("DB_POOLER_PORT", "6543"))
                pooler_user = os.getenv("DB_POOLER_USER")
                
                if not pooler_host or not pooler_user:
                    # Try to construct from project ref (may not work if region is different)
                    # The correct pooler host should be obtained from Supabase Dashboard
                    print("⚠️  Pooler host not configured in .env")
                    print()
                    print("💡 To get the correct pooler connection string:")
                    print("   1. Go to https://supabase.com/dashboard")
                    print("   2. Select your project")
                    print("   3. Go to Settings → Database")
                    print("   4. Scroll to 'Connection string' section")
                    print("   5. Select 'Transaction' mode and copy the connection string")
                    print("   6. Extract host, port, and user from the connection string")
                    print()
                    print("   Example format:")
                    print("   postgresql://postgres.[PROJECT-REF]:[PASSWORD]@[REGION].pooler.supabase.com:6543/postgres")
                    print()
                    print("   Add to .env:")
                    print("   DB_POOLER_HOST=[REGION].pooler.supabase.com")
                    print("   DB_POOLER_PORT=6543")
                    print("   DB_POOLER_USER=postgres.rutcjpugsrfoobsrufnn")
                    print()
                    
                # Try a few common pooler hosts as fallback
                # Note: Some projects use aws-0, others use aws-1 prefix
                common_regions = [
                    "aws-1-us-east-1",   # N. Virginia (aws-1 variant)
                    "aws-0-us-east-1",   # N. Virginia (aws-0 variant)
                    "aws-1-ap-south-1",  # Mumbai (aws-1 variant)
                    "aws-0-ap-south-1",  # Mumbai (aws-0 variant)
                    "aws-1-eu-west-1",   # Ireland (aws-1 variant)
                    "aws-0-eu-west-1",   # Ireland (aws-0 variant)
                    "aws-1-ap-southeast-1", # Singapore (aws-1 variant)
                    "aws-0-ap-southeast-1", # Singapore (aws-0 variant)
                ]
                
                pooler_worked = False
                for region in common_regions:
                    try:
                        test_pooler_host = f"{region}.pooler.supabase.com"
                        test_pooler_user = f"postgres.{project_ref}"
                        
                        print(f"   Trying pooler: {test_pooler_host}:{pooler_port} as {test_pooler_user}...")
                        
                        test_conn = psycopg2.connect(
                            host=test_pooler_host,
                            port=pooler_port,
                            user=test_pooler_user,
                            password=password,
                            database=db_name,
                            connect_timeout=10,
                            sslmode='require'
                        )
                        
                        # Success!
                        pooler_host = test_pooler_host
                        pooler_user = test_pooler_user
                        pooler_conn = test_conn
                        pooler_worked = True
                        print(f"   ✅ Found working pooler: {test_pooler_host}")
                        break
                    except Exception as test_error:
                        if "Tenant or user not found" not in str(test_error):
                            # Different error, might be network issue
                            print(f"   ⚠️  {test_pooler_host}: {str(test_error)[:60]}")
                        continue
                
                if not pooler_worked:
                        raise psycopg2.OperationalError("Could not find working pooler host. Please configure DB_POOLER_HOST in .env")
                else:
                    # Use configured pooler settings
                    print(f"   Using configured pooler: {pooler_host}:{pooler_port}")
                    print(f"   User: {pooler_user}")
                    print()
                    
                    pooler_conn = psycopg2.connect(
                        host=pooler_host,
                        port=pooler_port,
                        user=pooler_user,
                        password=password,
                        database=db_name,
                        connect_timeout=15,
                        sslmode='require'
                    )
                
                # If we get here, pooler connection succeeded
                print("✅ Connection pooler successful!")
                print()
                print("💡 Use pooler settings in your .env:")
                print(f"   DB_HOST={pooler_host}")
                print(f"   DB_PORT={pooler_port}")
                print(f"   DB_USER={pooler_user}")
                print()
                
                # Test query via pooler
                cursor = pooler_conn.cursor()
                cursor.execute("SELECT version();")
                version = cursor.fetchone()[0]
                cursor.close()
                pooler_conn.close()
                
                print("=" * 60)
                print("✅ Connection Successful via Pooler!")
                print("=" * 60)
                print()
                print(f"PostgreSQL Version: {version[:80]}...")
                print()
                print("✅ Password is correct!")
                print()
                print("Update your .env file with pooler settings:")
                print()
                print("# Database Connection (using pooler)")
                print(f"DB_HOST={pooler_host}")
                print(f"DB_PORT={pooler_port}")
                print(f"DB_USER={pooler_user}")
                print(f"DB_PASSWORD={password}")
                print(f"DB_NAME={db_name}")
                print()
                print("✅ You can now run the agent with SQL queries!")
                print()
                sys.exit(0)  # Success via pooler
                
            except Exception as pooler_error:
                print(f"❌ Pooler connection also failed: {str(pooler_error)[:100]}")
                print()
                print("⚠️  Direct PostgreSQL connection timed out")
                print()
                if supabase_works:
                    print("✅ Your credentials are correct (REST API works)")
                    print("   This is a network/firewall issue blocking ports 5432 and 6543")
                    print()
                    print("💡 The agent will work for RAG queries, but SQL queries may fail.")
                    print("   To fix SQL queries, you need direct PostgreSQL access.")
                    print()
                    print("   Options:")
                    print("   1. Try from a different network (home vs office)")
                    print("   2. Use VPN if on restricted network")
                    print("   3. Check with your network admin about port restrictions")
                else:
                    print("⚠️  Most likely causes:")
                    print("   1. Database is PAUSED (check Supabase Dashboard)")
                    print("   2. Network/firewall blocking ports 5432 and 6543")
                    print("   3. Database host is unreachable")
                raise
        else:
            raise
    
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
    print(f"PostgreSQL Version: {version[:80]}...")
    print()
    print("✅ Password is correct and database is accessible!")
    print()
    print("Your .env file should have:")
    print()
    print("# Database Connection")
    print(f"DB_HOST={db_host}")
    print(f"DB_PORT={db_port}")
    print(f"DB_USER={db_user}")
    print(f"DB_PASSWORD={password}")
    print(f"DB_NAME={db_name}")
    print()
    print("✅ You can now run the agent!")
    print()
    
except psycopg2.OperationalError as e:
    error_str = str(e)
    print()
    print("=" * 60)
    print("❌ Connection Failed")
    print("=" * 60)
    print()
    print(f"Error: {error_str}")
    print()
    
    if "password authentication failed" in error_str.lower():
        print("❌ Password is incorrect or user doesn't exist")
        print()
        print("To fix:")
        print("1. Go to https://supabase.com/dashboard")
        print("2. Select your project → Settings → Database")
        print("3. Click 'Reset database password'")
        print("4. Copy the new password")
        print("5. Update DB_PASSWORD in your .env file")
    elif "could not connect" in error_str.lower() or "timeout" in error_str.lower():
        print("❌ Direct PostgreSQL connection timed out")
        print()
        if supabase_works:
            print("✅ Good news: Supabase REST API works (credentials are correct)")
            print()
            print("⚠️  Direct PostgreSQL connection is blocked, but this is OK!")
            print("   The agent can still work using Supabase client for most operations.")
            print()
            print("   However, SQL execution node requires direct PostgreSQL connection.")
            print("   Possible solutions:")
            print("   1. Check if your network/firewall allows port 5432")
            print("   2. Try from a different network (home vs office)")
            print("   3. Use Supabase connection pooler (port 6543)")
            print("   4. Use VPN if on restricted network")
        else:
            print("⚠️  Both REST API and direct connection failed")
            print()
            print("Possible causes:")
            print("1. Database might be paused (check Supabase Dashboard)")
            print("2. Network/firewall blocking connections")
            print("3. Wrong credentials")
            print()
            print("To check database status:")
            print("1. Go to https://supabase.com/dashboard")
            print("2. Select your project")
            print("3. Check if all services show 'Healthy'")
    else:
        print("Unexpected error occurred")
    
    import traceback
    traceback.print_exc()
    sys.exit(1)
    
except ImportError:
    print("❌ psycopg2-binary is not installed")
    print("Run: pip install psycopg2-binary")
    sys.exit(1)
    
except Exception as e:
    print(f"❌ Error: {str(e)}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
