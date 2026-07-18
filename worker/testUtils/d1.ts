import { readFileSync } from 'node:fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'

export class TestD1Database {
  private readonly sqlite = new DatabaseSync(':memory:')

  constructor(migrationPaths: string[]) {
    this.sqlite.exec('PRAGMA foreign_keys = ON')
    for (const path of migrationPaths) {
      this.sqlite.exec(readFileSync(path, 'utf8'))
    }
  }

  asD1(): D1Database {
    return this as unknown as D1Database
  }

  prepare(query: string): D1PreparedStatement {
    return new TestD1Statement(this.sqlite, query) as unknown as D1PreparedStatement
  }

  async batch(
    statements: D1PreparedStatement[],
  ): Promise<D1Result<unknown>[]> {
    this.sqlite.exec('BEGIN')
    try {
      const results: D1Result<unknown>[] = []
      for (const statement of statements) {
        results.push(await statement.run())
      }
      this.sqlite.exec('COMMIT')
      return results
    } catch (error) {
      this.sqlite.exec('ROLLBACK')
      throw error
    }
  }

  exec(query: string): D1ExecResult {
    this.sqlite.exec(query)
    return {
      count: 0,
      duration: 0,
    }
  }

  close(): void {
    this.sqlite.close()
  }

  rows<T extends Record<string, unknown>>(
    query: string,
    ...values: unknown[]
  ): T[] {
    return this.sqlite.prepare(query).all(...toSqliteValues(values)) as T[]
  }

  run(query: string, ...values: unknown[]): void {
    this.sqlite.prepare(query).run(...toSqliteValues(values))
  }
}

class TestD1Statement {
  constructor(
    private readonly sqlite: DatabaseSync,
    private readonly query: string,
    private readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new TestD1Statement(
      this.sqlite,
      this.query,
      values,
    ) as unknown as D1PreparedStatement
  }

  async first<T = Record<string, unknown>>(
    columnName?: string,
  ): Promise<T | null> {
    const row = this.statement().get(...toSqliteValues(this.values)) as
      | Record<string, unknown>
      | undefined
    if (!row) return null
    return (columnName ? row[columnName] : row) as T
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const results = this.statement().all(
      ...toSqliteValues(this.values),
    ) as T[]
    return d1Result(results)
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const result = this.statement().run(...toSqliteValues(this.values))
    return {
      success: true,
      results: [],
      meta: {
        changed_db: result.changes > 0,
        changes: Number(result.changes),
        duration: 0,
        last_row_id: Number(result.lastInsertRowid),
        rows_read: 0,
        rows_written: Number(result.changes),
        size_after: 0,
      },
    }
  }

  private statement(): StatementSync {
    return this.sqlite.prepare(this.query)
  }
}

function d1Result<T>(results: T[]): D1Result<T> {
  return {
    success: true,
    results,
    meta: {
      changed_db: false,
      changes: 0,
      duration: 0,
      last_row_id: 0,
      rows_read: results.length,
      rows_written: 0,
      size_after: 0,
    },
  }
}

function toSqliteValues(values: unknown[]): Array<string | number | bigint | null | Uint8Array> {
  return values.map((value) => {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'bigint' ||
      value === null ||
      value instanceof Uint8Array
    ) {
      return value
    }
    throw new TypeError(`Unsupported SQLite value: ${typeof value}`)
  })
}
