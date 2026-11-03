import type { Page, Response } from '@playwright/test';
import type { ApiEnvelope } from '@src/domain/models';
import { endpoints, type EndpointMatcher, type EndpointName } from './endpoints';

export function matches(response: Response, matcher: EndpointMatcher): boolean {
  return response.request().method() === matcher.method && matcher.path.test(response.url());
}

async function unwrap<T>(response: Response, name: string): Promise<T> {
  const body = (await response.json()) as ApiEnvelope<T>;
  if (response.status() !== 200 || body.code !== '200') {
    throw new Error(`${name} failed: HTTP ${response.status()}, code ${body.code}, ${body.message ?? ''}`.trim());
  }
  return body.result;
}

/**
 * Run `action` and return the parsed `result` of the first matching backend response.
 * The listener is registered before the action, so a fast response is never missed.
 *
 *   const order = await captureResult(page, 'placeMarket', () => panel.submit());
 */
export async function captureResult<T>(
  page: Page,
  name: EndpointName,
  action: () => Promise<unknown>,
  options: { timeout?: number; urlIncludes?: string } = {},
): Promise<T> {
  const matcher = endpoints[name];
  const { timeout = 20_000, urlIncludes } = options;
  const predicate = (r: Response) => matches(r, matcher) && (!urlIncludes || r.url().includes(urlIncludes));
  const [response] = await Promise.all([page.waitForResponse(predicate, { timeout }), action()]);
  return unwrap<T>(response, name);
}

/** Like captureResult, but returns the raw response (for negative tests that expect an error). */
export async function captureResponse(
  page: Page,
  name: EndpointName,
  action: () => Promise<unknown>,
  timeout = 20_000,
): Promise<Response> {
  const matcher = endpoints[name];
  const [response] = await Promise.all([page.waitForResponse((r) => matches(r, matcher), { timeout }), action()]);
  return response;
}

/** Wait for the next refresh of a GET list endpoint (the app refetches after every trade). */
export async function nextResult<T>(page: Page, name: EndpointName, timeout = 20_000): Promise<T> {
  const response = await page.waitForResponse((r) => matches(r, endpoints[name]), { timeout });
  return unwrap<T>(response, name);
}

/**
 * Collects every request to `name` sent while `action` runs.
 * Used to prove that something was NOT sent (e.g. no trade request on a closed market).
 */
export async function requestsDuring(page: Page, name: EndpointName, action: () => Promise<unknown>): Promise<number> {
  const matcher = endpoints[name];
  let count = 0;
  const listener = (request: { method(): string; url(): string }) => {
    if (request.method() === matcher.method && matcher.path.test(request.url())) count += 1;
  };
  page.on('request', listener);
  try {
    await action();
  } finally {
    page.off('request', listener);
  }
  return count;
}
