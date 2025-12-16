import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMonekoServer } from '../server.js';
import { createHmac } from 'node:crypto';

function base64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signHs256Jwt(payload: Record<string, unknown>, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const data = `${headerB64}.${payloadB64}`;
  const sig = base64url(createHmac('sha256', secret).update(data).digest());
  return `${data}.${sig}`;
}

describe('MVP Tools + Widgets', () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    process.env.EDGE_BASE_URL = 'https://example.invalid';
    process.env.EDGE_API_KEY = 'test';
    process.env.BASE_URL = 'https://public.example.com/mcp';
    process.env.PORT = '8000';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_JWT_SECRET = 'test-secret';
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  it('lists MVP tools', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createMonekoServer();
    await server.connect(serverTransport);

    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);

    const result = await client.listTools();
    const toolNames = result.tools.map((t) => t.name);

    expect(toolNames).toContain('log_expense');
    expect(toolNames).toContain('list_expenses');
    expect(toolNames).toContain('get_summary');
    expect(toolNames).toContain('create_category');
    expect(toolNames).toContain('list_categories');

    await client.close();
    await server.close();
  });

  it('gates category tools behind sign-in + subscription', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createMonekoServer();
    await server.connect(serverTransport);

    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);

    const initial = await client.callTool({ name: 'list_categories', arguments: {} });
    expect(initial.structuredContent).toBeTruthy();
    expect((initial.structuredContent as any).supabaseUrl).toContain('https://example.supabase.co');

    const token = signHs256Jwt(
      { sub: 'user-123', exp: Math.floor(Date.now() / 1000) + 60 * 60 },
      process.env.SUPABASE_JWT_SECRET!
    );
    await client.callTool({ name: 'moneko.set_auth_session', arguments: { access_token: token } });

    // With auth but without subscription, tools should return the membership paywall instead of categories.
    const gated = await client.callTool({ name: 'list_categories', arguments: {} });
    expect((gated.structuredContent as any).view).toBe('paywall');

    await client.close();
    await server.close();
  });

  it('serves widget resources with resolved asset base URL', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createMonekoServer();
    await server.connect(serverTransport);

    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);

    const expenseWidget = await client.readResource({ uri: 'ui://widget/expense-table.html' });
    const expenseHtml = (expenseWidget.contents[0] as any).text as string;
    expect(expenseHtml).toContain('https://public.example.com/assets/expense-table.js');
    expect(expenseHtml).not.toContain('__MONEKO_ASSET_BASE_URL__');

    const categoriesWidget = await client.readResource({ uri: 'ui://widget/categories.html' });
    const categoriesHtml = (categoriesWidget.contents[0] as any).text as string;
    expect(categoriesHtml).toContain('Categories');
    expect(categoriesHtml).toContain('create_category');
    expect(categoriesHtml).toContain('list_categories');

    await client.close();
    await server.close();
  });
});
