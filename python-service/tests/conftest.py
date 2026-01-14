"""Pytest configuration and fixtures."""
import sys
import os
from unittest.mock import MagicMock, patch

# Patch problematic imports before any test imports
# This prevents the import chain from loading database dependencies
sys.modules['services.db'] = MagicMock()
sys.modules['services.trace_service'] = MagicMock()
sys.modules['services.config'] = MagicMock()
sys.modules['supabase'] = MagicMock()
sys.modules['realtime'] = MagicMock()
sys.modules['websockets'] = MagicMock()
sys.modules['websockets.asyncio'] = MagicMock()
sys.modules['websockets.asyncio.client'] = MagicMock()

# Mock dotenv to avoid file system access during imports
_patched_dotenv = MagicMock()
_patched_dotenv.load_dotenv = MagicMock(return_value=True)
sys.modules['dotenv'] = _patched_dotenv
