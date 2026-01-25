'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Plug,
  Trash2,
  RefreshCw,
  Check,
  X,
  AlertCircle,
  Loader2,
  ExternalLink,
  LogIn,
  Shield,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useMCPServers } from '@/hooks/use-mcp-servers';
import type { MCPServer, MCPServerCreate } from '@/lib/mcp/types';

interface MCPSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Status indicator component
function StatusIndicator({ status }: { status: MCPServer['connection_status'] }) {
  const statusConfig = {
    connected: { color: 'bg-green-500', label: 'Connected' },
    disconnected: { color: 'bg-yellow-500', label: 'Disconnected' },
    error: { color: 'bg-red-500', label: 'Error' },
    unknown: { color: 'bg-gray-400', label: 'Unknown' },
  };

  const config = statusConfig[status] || statusConfig.unknown;

  return (
    <div className="flex items-center gap-1.5">
      <div className={cn('size-2 rounded-full', config.color)} />
      <span className="text-xs text-muted-foreground">{config.label}</span>
    </div>
  );
}

// Server card component
function ServerCard({
  server,
  onToggle,
  onTest,
  onDelete,
  onAuth,
  isTesting,
  isAuthenticating,
}: {
  server: MCPServer;
  onToggle: () => void;
  onTest: () => void;
  onDelete: () => void;
  onAuth?: () => void;
  isTesting: boolean;
  isAuthenticating?: boolean;
}) {
  const needsAuth = server.requires_auth && !server.oauth_access_token;
  
  return (
    <div
      className={cn(
        'group rounded-lg border p-4 transition-colors',
        server.is_enabled ? 'bg-card' : 'bg-muted/30 opacity-60'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Plug className="size-4 text-muted-foreground shrink-0" />
            <h4 className="font-medium truncate">{server.name}</h4>
            {server.requires_auth && (
              <Badge variant="outline" className="text-xs">
                <Shield className="size-3 mr-1" />
                Auth
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 truncate">{server.url}</p>
          <div className="flex items-center gap-3 mt-2">
            <StatusIndicator status={server.connection_status} />
            {server.tools_count > 0 && (
              <span className="text-xs text-muted-foreground">
                {server.tools_count} tools
              </span>
            )}
            {server.resources_count > 0 && (
              <span className="text-xs text-muted-foreground">
                {server.resources_count} resources
              </span>
            )}
          </div>
          {server.error_message && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-destructive">
              <AlertCircle className="size-3" />
              <span className="truncate">{server.error_message}</span>
            </div>
          )}
          {needsAuth && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-600">
              <LogIn className="size-3" />
              <span>Authentication required</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {needsAuth && onAuth ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={onAuth}
              disabled={isAuthenticating}
            >
              {isAuthenticating ? (
                <>
                  <Loader2 className="size-4 mr-1 animate-spin" />
                  Authenticating...
                </>
              ) : (
                <>
                  <LogIn className="size-4 mr-1" />
                  Authenticate
                </>
              )}
            </Button>
          ) : (
            <Switch
              checked={server.is_enabled}
              onCheckedChange={onToggle}
              className="scale-90"
            />
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-foreground"
            onClick={onTest}
            disabled={isTesting}
          >
            {isTesting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// Add server form with OAuth support
function AddServerForm({
  onAdd,
  onCancel,
  onOAuthComplete,
}: {
  onAdd: (server: MCPServerCreate & { requires_auth?: boolean }) => Promise<boolean>;
  onCancel: () => void;
  onOAuthComplete?: () => void;
}) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [transportType, setTransportType] = useState<'http' | 'sse'>('http');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    tools: string[];
    requiresAuth?: boolean;
    authUrl?: string;
    sessionId?: string;
    error?: string;
  } | null>(null);

  const { testConnection, connectWithOAuth, finishOAuth } = useMCPServers();

  // Handle OAuth message from popup
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data.type === 'mcp-oauth-success' && testResult?.sessionId) {
        setIsAuthenticating(true);
        const result = await finishOAuth(event.data.code, testResult.sessionId);
        setIsAuthenticating(false);
        
        if (result.success) {
          toast.success(`Authenticated! Found ${result.tools?.length || 0} tools`);
          setTestResult({
            success: true,
            tools: result.tools || [],
            requiresAuth: true,
          });
          onOAuthComplete?.();
        } else {
          toast.error(result.error || 'Authentication failed');
        }
      } else if (event.data.type === 'mcp-oauth-error') {
        toast.error(`OAuth failed: ${event.data.error}`);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [testResult?.sessionId, finishOAuth, onOAuthComplete]);

  const handleTest = async () => {
    if (!url) {
      toast.error('Please enter a URL');
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    // First try with OAuth connect to detect auth requirements
    const oauthResult = await connectWithOAuth(url);
    
    if (oauthResult.requiresAuth && oauthResult.authUrl) {
      setTestResult({
        success: false,
        tools: [],
        requiresAuth: true,
        authUrl: oauthResult.authUrl,
        sessionId: oauthResult.sessionId,
        error: 'This server requires authentication',
      });
      toast.info('This server requires OAuth authentication');
      setIsTesting(false);
      return;
    }

    if (oauthResult.success) {
      setTestResult({
        success: true,
        tools: oauthResult.tools || [],
        requiresAuth: false,
      });
      toast.success(`Connected! Found ${oauthResult.tools?.length || 0} tools`);
    } else {
      // Fallback to basic connection test
      const result = await testConnection(url, transportType);
      setTestResult({
        success: result.success,
        tools: result.tools,
        requiresAuth: false,
        error: result.error,
      });
      
      if (result.success) {
        toast.success(`Connected! Found ${result.tools.length} tools`);
      } else {
        toast.error(result.error || 'Connection failed');
      }
    }

    setIsTesting(false);
  };

  const handleOAuthLogin = () => {
    if (testResult?.authUrl) {
      window.open(
        testResult.authUrl,
        'mcp-oauth-popup',
        'width=600,height=700,scrollbars=yes,resizable=yes'
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !url) {
      toast.error('Name and URL are required');
      return;
    }

    setIsSubmitting(true);
    const success = await onAdd({ 
      name, 
      url, 
      transport_type: transportType,
      requires_auth: testResult?.requiresAuth,
    });
    setIsSubmitting(false);

    if (success) {
      toast.success('Server added successfully');
      onCancel();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-lg bg-muted/30">
      <div className="space-y-2">
        <Label htmlFor="server-name">Name</Label>
        <Input
          id="server-name"
          placeholder="e.g., My MCP Server"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="server-url">URL</Label>
        <Input
          id="server-url"
          placeholder="https://my-server.com/mcp"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="transport-type">Transport</Label>
        <Select value={transportType} onValueChange={(v) => setTransportType(v as 'http' | 'sse')}>
          <SelectTrigger id="transport-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="http">HTTP (Recommended)</SelectItem>
            <SelectItem value="sse">SSE (Server-Sent Events)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {testResult && (
        <div
          className={cn(
            'flex flex-col gap-2 p-3 rounded-lg text-sm',
            testResult.success 
              ? 'bg-green-500/10 text-green-600' 
              : testResult.requiresAuth 
                ? 'bg-amber-500/10 text-amber-600'
                : 'bg-destructive/10 text-destructive'
          )}
        >
          <div className="flex items-center gap-2">
            {testResult.success ? (
              <>
                <Check className="size-4" />
                <span>Connected! Found {testResult.tools.length} tools</span>
              </>
            ) : testResult.requiresAuth ? (
              <>
                <Shield className="size-4" />
                <span>This server requires authentication</span>
              </>
            ) : (
              <>
                <X className="size-4" />
                <span>{testResult.error}</span>
              </>
            )}
          </div>
          
          {testResult.requiresAuth && testResult.authUrl && !testResult.success && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleOAuthLogin}
              disabled={isAuthenticating}
              className="w-fit"
            >
              {isAuthenticating ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Authenticating...
                </>
              ) : (
                <>
                  <LogIn className="size-4 mr-2" />
                  Sign in to connect
                </>
              )}
            </Button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleTest}
          disabled={!url || isTesting}
        >
          {isTesting ? (
            <>
              <Loader2 className="size-4 mr-2 animate-spin" />
              Testing...
            </>
          ) : (
            <>
              <RefreshCw className="size-4 mr-2" />
              Test Connection
            </>
          )}
        </Button>

        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!name || !url || isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              'Add Server'
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}

export function MCPSettingsModal({ open, onOpenChange }: MCPSettingsModalProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [authenticatingServerId, setAuthenticatingServerId] = useState<string | null>(null);
  const { 
    servers, 
    loading, 
    testing, 
    addServer, 
    toggleServer, 
    testServerById, 
    deleteServer,
    connectWithOAuth,
    finishOAuth,
    loadServers,
  } = useMCPServers();

  // Handle OAuth message from popup
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data.type === 'mcp-oauth-success' && authenticatingServerId) {
        const server = servers.find(s => s.id === authenticatingServerId);
        if (server) {
          // We need to complete OAuth and update the server
          const result = await finishOAuth(
            event.data.code, 
            `server-${authenticatingServerId}`,
            authenticatingServerId
          );
          
          if (result.success) {
            toast.success(`Authenticated! Found ${result.tools?.length || 0} tools`);
            await loadServers();
          } else {
            toast.error(result.error || 'Authentication failed');
          }
        }
        setAuthenticatingServerId(null);
      } else if (event.data.type === 'mcp-oauth-error') {
        toast.error(`OAuth failed: ${event.data.error}`);
        setAuthenticatingServerId(null);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [authenticatingServerId, servers, finishOAuth, loadServers]);

  const handleAddServer = async (server: MCPServerCreate & { requires_auth?: boolean }): Promise<boolean> => {
    const result = await addServer({
      ...server,
      // Note: requires_auth is handled by the backend during OAuth flow
    });
    return result !== null;
  };

  const handleDeleteServer = async (serverId: string) => {
    if (!confirm('Are you sure you want to delete this server?')) return;
    const success = await deleteServer(serverId);
    if (success) {
      toast.success('Server deleted');
    } else {
      toast.error('Failed to delete server');
    }
  };

  const handleTestServer = async (serverId: string) => {
    const result = await testServerById(serverId);
    if (result.success) {
      toast.success(`Connected! Found ${result.tools.length} tools`);
    } else {
      toast.error(result.error || 'Connection failed');
    }
  };

  const handleToggleServer = async (serverId: string) => {
    await toggleServer(serverId);
  };

  const handleAuthServer = useCallback(async (serverId: string) => {
    const server = servers.find(s => s.id === serverId);
    if (!server) return;

    setAuthenticatingServerId(serverId);
    
    const result = await connectWithOAuth(server.url, serverId);
    
    if (result.requiresAuth && result.authUrl) {
      // Open OAuth popup
      window.open(
        result.authUrl,
        'mcp-oauth-popup',
        'width=600,height=700,scrollbars=yes,resizable=yes'
      );
    } else if (result.success) {
      toast.success(`Connected! Found ${result.tools?.length || 0} tools`);
      await loadServers();
      setAuthenticatingServerId(null);
    } else {
      toast.error(result.error || 'Connection failed');
      setAuthenticatingServerId(null);
    }
  }, [servers, connectWithOAuth, loadServers]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plug className="size-5" />
            MCP Connections
          </DialogTitle>
          <DialogDescription>
            Connect external MCP servers to extend Catalyst&apos;s capabilities with custom tools.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4 pb-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : servers.length === 0 && !showAddForm ? (
              <div className="text-center py-8">
                <Plug className="size-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No MCP servers configured</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Add a server to extend Catalyst with custom tools
                </p>
              </div>
            ) : (
              <>
                {servers.map((server) => (
                  <ServerCard
                    key={server.id}
                    server={server}
                    onToggle={() => handleToggleServer(server.id)}
                    onTest={() => handleTestServer(server.id)}
                    onDelete={() => handleDeleteServer(server.id)}
                    onAuth={() => handleAuthServer(server.id)}
                    isTesting={testing === server.id}
                    isAuthenticating={authenticatingServerId === server.id}
                  />
                ))}
              </>
            )}

            {showAddForm && (
              <>
                {servers.length > 0 && <Separator />}
                <AddServerForm 
                  onAdd={handleAddServer} 
                  onCancel={() => setShowAddForm(false)}
                  onOAuthComplete={() => loadServers()}
                />
              </>
            )}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between pt-4 border-t">
          <a
            href="https://modelcontextprotocol.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            Learn about MCP
            <ExternalLink className="size-3" />
          </a>

          {!showAddForm && (
            <Button size="sm" onClick={() => setShowAddForm(true)}>
              <Plus className="size-4 mr-2" />
              Add Server
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
