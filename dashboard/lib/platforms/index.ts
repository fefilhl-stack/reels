import type { Account, Platform } from '../types';
import { demoAdapter } from './demo';
import { instagram } from './instagram';
import { tiktok } from './tiktok';
import type { PlatformAdapter } from './types';
import { youtube } from './youtube';

export const adapters: Record<Platform, PlatformAdapter> = { tiktok, instagram, youtube };

export function adapterFor(account: Pick<Account, 'platform' | 'is_demo'>): PlatformAdapter {
  return account.is_demo ? demoAdapter(account.platform) : adapters[account.platform];
}
