// Type definitions for Deno APIs used in Supabase Edge Functions
// This file helps TypeScript understand Deno-specific imports and globals

declare module 'https://deno.land/std@0.177.0/http/server.ts' {
  export interface ConnInfo {
    readonly remoteAddr: Deno.Addr;
  }
  
  export interface Handler {
    (request: Request, connInfo: ConnInfo): Response | Promise<Response>;
  }
  
  export function serve(handler: Handler, options?: {
    port?: number;
    hostname?: string;
  }): void;
}

declare module 'https://esm.sh/@supabase/supabase-js@2.7.1' {
  export interface SupabaseClientOptions {
    auth?: {
      autoRefreshToken?: boolean;
      persistSession?: boolean;
      detectSessionInUrl?: boolean;
    };
  }
  
  export interface PostgrestResponse<T> {
    data: T | null;
    error: Error | null;
    count: number | null;
    status: number;
    statusText: string;
  }
  
  export interface PostgrestSingleResponse<T> extends PostgrestResponse<T> {
    data: T | null;
  }
  
  export interface PostgrestMaybeSingleResponse<T> extends PostgrestResponse<T> {
    data: T | null;
  }
  
  export interface PostgrestFilterBuilder<T> {
    eq(column: string, value: any): PostgrestFilterBuilder<T>;
    neq(column: string, value: any): PostgrestFilterBuilder<T>;
    gt(column: string, value: any): PostgrestFilterBuilder<T>;
    gte(column: string, value: any): PostgrestFilterBuilder<T>;
    lt(column: string, value: any): PostgrestFilterBuilder<T>;
    lte(column: string, value: any): PostgrestFilterBuilder<T>;
    like(column: string, pattern: string): PostgrestFilterBuilder<T>;
    ilike(column: string, pattern: string): PostgrestFilterBuilder<T>;
    is(column: string, value: any): PostgrestFilterBuilder<T>;
    in(column: string, values: any[]): PostgrestFilterBuilder<T>;
    contains(column: string, value: any): PostgrestFilterBuilder<T>;
    containedBy(column: string, value: any): PostgrestFilterBuilder<T>;
    rangeLt(column: string, range: any): PostgrestFilterBuilder<T>;
    rangeGt(column: string, range: any): PostgrestFilterBuilder<T>;
    rangeGte(column: string, range: any): PostgrestFilterBuilder<T>;
    rangeLte(column: string, range: any): PostgrestFilterBuilder<T>;
    rangeAdjacent(column: string, range: any): PostgrestFilterBuilder<T>;
    overlaps(column: string, value: any): PostgrestFilterBuilder<T>;
    textSearch(column: string, query: string, options?: { config?: string, type?: 'plain' | 'phrase' | 'websearch' | 'raw' }): PostgrestFilterBuilder<T>;
    filter(column: string, operator: string, value: any): PostgrestFilterBuilder<T>;
    not(column: string, operator: string, value: any): PostgrestFilterBuilder<T>;
    or(filters: string, options?: { foreignTable?: string }): PostgrestFilterBuilder<T>;
    order(column: string, options?: { ascending?: boolean, nullsFirst?: boolean, foreignTable?: string }): PostgrestFilterBuilder<T>;
    limit(count: number, options?: { foreignTable?: string }): PostgrestFilterBuilder<T>;
    offset(count: number, options?: { foreignTable?: string }): PostgrestFilterBuilder<T>;
    select(columns: string, options?: { head?: boolean, count?: 'exact' | 'planned' | 'estimated', foreignTable?: string }): PostgrestFilterBuilder<T>;
    single(): Promise<PostgrestSingleResponse<T>>;
    maybeSingle(): Promise<PostgrestMaybeSingleResponse<T>>;
  }
  
  export interface PostgrestQueryBuilder<T> {
    select(columns?: string, options?: { head?: boolean, count?: 'exact' | 'planned' | 'estimated' }): PostgrestFilterBuilder<T>;
    insert(values: Partial<T> | Partial<T>[], options?: { returning?: 'minimal' | 'representation', count?: 'exact' | 'planned' | 'estimated' }): Promise<PostgrestResponse<T>>;
    upsert(values: Partial<T> | Partial<T>[], options?: { returning?: 'minimal' | 'representation', count?: 'exact' | 'planned' | 'estimated', onConflict?: string }): Promise<PostgrestResponse<T>>;
    update(values: Partial<T>, options?: { returning?: 'minimal' | 'representation', count?: 'exact' | 'planned' | 'estimated' }): PostgrestFilterBuilder<T>;
    delete(options?: { returning?: 'minimal' | 'representation', count?: 'exact' | 'planned' | 'estimated' }): PostgrestFilterBuilder<T>;
  }
  
  export interface SupabaseClient {
    from<T>(table: string): PostgrestQueryBuilder<T>;
    auth: {
      getUser(jwt?: string): Promise<{ data: { user: any }, error: Error | null }>;
    };
    storage: any;
    functions: {
      invoke(functionName: string, options?: { body?: any }): Promise<{ data: any, error: Error | null }>;
    };
  }
  
  export function createClient(supabaseUrl: string, supabaseKey: string, options?: SupabaseClientOptions): SupabaseClient;
}

export declare namespace Deno {
  interface Addr {
    transport: 'tcp' | 'udp';
    hostname: string;
    port: number;
  }
  
  const env: {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    delete(key: string): void;
    toObject(): { [key: string]: string };
  };
  
  function serve(handler: (request: Request) => Response | Promise<Response>, options?: { port?: number; hostname?: string }): void;
}
