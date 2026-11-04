import { ref } from 'vue';
import { isMobile } from '../lib/platform';

/**
 * Shared open state for the update centre.
 *
 * The Settings button, the Help menu item and the startup check must all
 * raise the *same* dialog — a per-component `ref` would mount three copies
 * and let two of them show stale data.
 */
export const updateCenterOpen = ref(false);

export function openUpdateCenter(): void {
  // Desktop-only surface. Mobile ships through the app stores: it must never
  // show the channel picker or the in-app installer, whatever path opened it.
  if (isMobile()) return;
  updateCenterOpen.value = true;
}
