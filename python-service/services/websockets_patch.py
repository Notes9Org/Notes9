"""
Patch for websockets.asyncio compatibility with supabase realtime.

This module patches the websockets import to work with newer versions of websockets
that changed the module structure.
"""
import sys
import types

# Patch websockets.asyncio before supabase imports it
try:
    import websockets
    
    # For websockets >= 12.0, asyncio module was removed
    # Create compatibility shim
    if not hasattr(websockets, 'asyncio'):
        # Create asyncio module
        asyncio_module = types.ModuleType('websockets.asyncio')
        
        # Create client submodule
        client_module = types.ModuleType('websockets.asyncio.client')
        
        # Import ClientConnection from websockets.client (new location)
        try:
            from websockets.client import ClientConnection
            client_module.ClientConnection = ClientConnection
        except ImportError:
            # Fallback: try old import path
            try:
                from websockets.asyncio.client import ClientConnection
                client_module.ClientConnection = ClientConnection
            except ImportError:
                # Create a mock if all else fails
                class MockClientConnection:
                    pass
                client_module.ClientConnection = MockClientConnection
        
        # Attach client to asyncio module
        asyncio_module.client = client_module
        
        # Attach asyncio to websockets
        websockets.asyncio = asyncio_module
        
        # Also add to sys.modules for import resolution
        sys.modules['websockets.asyncio'] = asyncio_module
        sys.modules['websockets.asyncio.client'] = client_module
        
except ImportError:
    # websockets not installed - create minimal mock
    websockets_mock = types.ModuleType('websockets')
    asyncio_mock = types.ModuleType('websockets.asyncio')
    client_mock = types.ModuleType('websockets.asyncio.client')
    
    class MockClientConnection:
        pass
    
    client_mock.ClientConnection = MockClientConnection
    asyncio_mock.client = client_mock
    websockets_mock.asyncio = asyncio_mock
    
    sys.modules['websockets'] = websockets_mock
    sys.modules['websockets.asyncio'] = asyncio_mock
    sys.modules['websockets.asyncio.client'] = client_mock
