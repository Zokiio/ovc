import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeUrl(url: string): string {
  let finalServer = url.trim();
  if (!finalServer.startsWith('ws://') && !finalServer.startsWith('wss://')) {
     finalServer = `wss://${finalServer}`;
  }
  return finalServer;
}
