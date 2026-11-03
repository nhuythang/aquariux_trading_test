import fs from 'node:fs';
import path from 'node:path';

/**
 * Writes the records a test observed to artifacts/records/<testId>.json.
 * The Python layer (api-tests) validates these files against its models and rules,
 * so the record shape is the contract between the two layers.
 */

export const RECORDS_DIR = path.resolve(__dirname, '../../../artifacts/records');

export interface RecordFile {
  testId: string;
  capturedAt: string;
  records: Record<string, unknown>;
}

export class Recorder {
  private readonly records: Record<string, unknown> = {};

  constructor(private readonly testId: string) {}

  add(key: string, value: unknown): void {
    this.records[key] = value;
  }

  get isEmpty(): boolean {
    return Object.keys(this.records).length === 0;
  }

  save(): string | undefined {
    if (this.isEmpty) return undefined;
    fs.mkdirSync(RECORDS_DIR, { recursive: true });
    const file = path.join(RECORDS_DIR, `${this.testId}.json`);
    const content: RecordFile = { testId: this.testId, capturedAt: new Date().toISOString(), records: this.records };
    fs.writeFileSync(file, JSON.stringify(content, null, 2));
    return file;
  }
}
