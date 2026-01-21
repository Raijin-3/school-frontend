/**
 * Comprehensive user cache clearing utility
 * This function clears all user-related caches and data when logging out
 * or when a user session needs to be completely reset.
 */

export async function clearUserCache(): Promise<void> {
  try {
    // Clear browser storage
    console.log('Clearing browser storage...');
    localStorage.clear();
    sessionStorage.clear();

    // Clear learning path specific cache
    console.log('Clearing learning path cache...');
    localStorage.removeItem('jarvis-learning-path-refresh');
    sessionStorage.removeItem('jarvis-learning-path-refresh');

    // Clear service worker caches if available
    if ('caches' in window) {
      try {
        const cacheNames = await caches.keys();
        console.log(`Clearing ${cacheNames.length} service worker caches...`);
        for (const cacheName of cacheNames) {
          await caches.delete(cacheName);
        }
      } catch (cacheError) {
        console.warn('Failed to clear service worker caches:', cacheError);
      }
    }

    // Clear IndexedDB databases if available
    if ('indexedDB' in window) {
      try {
        const databases = await window.indexedDB.databases();
        console.log(`Clearing ${databases.length} IndexedDB databases...`);
        for (const db of databases) {
          const dbName = db.name || '';
          if (dbName) {
            await new Promise((resolve, reject) => {
              const request = window.indexedDB.deleteDatabase(dbName);
              request.onsuccess = resolve;
              request.onerror = reject;
              request.onblocked = reject;
            });
          }
        }
      } catch (indexedDBError) {
        console.warn('Failed to clear IndexedDB databases:', indexedDBError);
      }
    }

    // Dispatch cache clearing events for components to handle
    console.log('Dispatching cache clear events...');
    window.dispatchEvent(new Event('learning-path-cache-clear'));
    window.dispatchEvent(new Event('user-cache-clear'));

    console.log('User cache cleared successfully');
  } catch (error) {
    console.error('Error clearing user cache:', error);
    throw error;
  }
}

/**
 * Clear specific learning path caches without affecting other user data
 */
export function clearLearningPathCache(): void {
  try {
    console.log('Clearing learning path specific cache...');
    localStorage.removeItem('jarvis-learning-path-refresh');
    sessionStorage.removeItem('jarvis-learning-path-refresh');
    window.dispatchEvent(new Event('learning-path-cache-clear'));
  } catch (error) {
    console.error('Error clearing learning path cache:', error);
  }
}

/**
 * Clear browser storage (localStorage and sessionStorage)
 */
export function clearBrowserStorage(): void {
  try {
    console.log('Clearing browser storage...');
    localStorage.clear();
    sessionStorage.clear();
  } catch (error) {
    console.error('Error clearing browser storage:', error);
  }
}
