import path from 'node:path';
import dotenv from 'dotenv';

// .env lives at the repository root so both test layers share it.
dotenv.config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

export interface Env {
  baseUrl: string;
  username: string;
  password: string;
}

const DEFAULT_BASE_URL = 'https://aqxtrader.aquariux.com';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env at the repository root and fill it in.`,
    );
  }
  return value;
}

/** Saved login session, written by the setup project and reused by every test. */
export const STORAGE_STATE = path.resolve(__dirname, '../../.auth/demo-user.json');

export const baseUrl = (process.env.BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, '');

/** Credentials are only needed by the login setup, so they are read lazily. */
export function credentials(): Pick<Env, 'username' | 'password'> {
  return { username: required('DEMO_USERNAME'), password: required('DEMO_PASSWORD') };
}
