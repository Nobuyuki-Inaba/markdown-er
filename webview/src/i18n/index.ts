import type { Locale } from '@shared/messages';
import { useUiStore } from '../store/uiStore';
import { en, Messages } from './en';
import { ja } from './ja';

export type { Messages };

const MESSAGES: Record<Locale, Messages> = { en, ja };

/** UI messages for the current locale; re-renders when the locale changes. */
export function useMessages(): Messages {
  return MESSAGES[useUiStore((s) => s.locale)];
}

/** For code outside React render (event handlers, FileReader callbacks) */
export function getMessages(): Messages {
  return MESSAGES[useUiStore.getState().locale];
}

/** Date/time formatting that follows the UI locale */
export function formatDateTime(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return iso;
  return date.toLocaleString(locale === 'ja' ? 'ja-JP' : 'en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}
