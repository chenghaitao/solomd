import { ref } from 'vue';

/**
 * Shared open state for the update centre.
 *
 * The Settings button, the Help menu item and the startup check must all
 * raise the *same* dialog — a per-component `ref` would mount three copies
 * and let two of them show stale data.
 */
export const updateCenterOpen = ref(false);

export function openUpdateCenter(): void {
  updateCenterOpen.value = true;
}
