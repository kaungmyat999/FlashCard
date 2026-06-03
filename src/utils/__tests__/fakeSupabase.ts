/**
 * Minimal fake of the supabase-js fluent client used by db.ts.
 *
 * Each `from(table)` returns a chain that records every method call
 * (select, insert, update, upsert, delete, eq, order, single) and
 * resolves to a configurable { data, error } when awaited.
 */

export interface FakeResponse<T = unknown> {
  data?: T;
  error?: { message: string } | null;
  count?: number | null;
}

export interface RecordedCall {
  table: string;
  ops: Array<{ op: string; args: unknown[] }>;
}

class FakeChain implements PromiseLike<FakeResponse> {
  table: string;
  ops: Array<{ op: string; args: unknown[] }> = [];
  private response: FakeResponse;
  private record: (call: RecordedCall) => void;

  constructor(
    table: string,
    response: FakeResponse,
    record: (call: RecordedCall) => void
  ) {
    this.table = table;
    this.response = response;
    this.record = record;
  }

  private push(op: string, args: unknown[]) {
    this.ops.push({ op, args });
    return this;
  }

  select(...args: unknown[]) { return this.push('select', args); }
  insert(...args: unknown[]) { return this.push('insert', args); }
  update(...args: unknown[]) { return this.push('update', args); }
  upsert(...args: unknown[]) { return this.push('upsert', args); }
  delete(...args: unknown[]) { return this.push('delete', args); }
  eq(...args: unknown[]) { return this.push('eq', args); }
  order(...args: unknown[]) { return this.push('order', args); }
  single() { return this.push('single', []); }

  then<TResult1 = FakeResponse, TResult2 = never>(
    onfulfilled?: ((value: FakeResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    this.record({ table: this.table, ops: this.ops });
    return Promise.resolve(this.response).then(onfulfilled, onrejected);
  }
}

export interface FakeSupabaseHandle {
  client: { from: (table: string) => FakeChain };
  calls: RecordedCall[];
  /** Set the response that the next awaited chain (or matching table) returns */
  setNextResponse: (response: FakeResponse) => void;
  setResponseForTable: (table: string, response: FakeResponse) => void;
}

export function createFakeSupabase(): FakeSupabaseHandle {
  const calls: RecordedCall[] = [];
  let nextResponse: FakeResponse | null = null;
  const perTable = new Map<string, FakeResponse>();

  const client = {
    from: (table: string) => {
      const response = nextResponse ?? perTable.get(table) ?? { data: null, error: null };
      nextResponse = null;
      return new FakeChain(table, response, (call) => calls.push(call));
    },
  };

  return {
    client,
    calls,
    setNextResponse: (r) => {
      nextResponse = r;
    },
    setResponseForTable: (table, r) => {
      perTable.set(table, r);
    },
  };
}
