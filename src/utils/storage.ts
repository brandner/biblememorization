export interface VerseState {
  reference: string;
  text?: string;
  day: number;
  lastPracticed: string | null; // ISO date string
  completed: boolean;
  translation?: string; // e.g. 'esv', 'web'
  startedDate?: string; // ISO date string when verse was first fetched
  completedDate?: string; // ISO date string when the 7-day cycle finished
  lastReviewedDate?: string; // ISO date string of most recent spaced-repetition review
}

export interface AppState {
  uid: string;
  userName?: string;
  avatar?: string;
  preferredTranslation?: 'esv' | 'niv' | 'msg' | 'web'; // persisted translation preference
  activeVerse: VerseState | null;
  memorizedVerses: VerseState[]; // Note: 'text' may be omitted to save space
}

const DEFAULT_STATE: Omit<AppState, 'uid'> = {
  activeVerse: null,
  memorizedVerses: []
};

function generateUID(): string {
  return 'uid_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export function getUID(): string {
  // 1. Check URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const urlUid = urlParams.get('uid');
  if (urlUid) {
    localStorage.setItem('bible_app_uid', urlUid);
    return urlUid;
  }

  // 2. Check Local Storage
  const localUid = localStorage.getItem('bible_app_uid');
  if (localUid) {
    return localUid;
  }

  // 3. Generate New
  const newUid = generateUID();
  localStorage.setItem('bible_app_uid', newUid);
  return newUid;
}

export async function fetchState(uid: string): Promise<AppState> {
  try {
    const response = await fetch(`/api/data?uid=${uid}`);
    if (response.ok) {
      const data = await response.json();
      localStorage.setItem(`bible_app_state_${uid}`, JSON.stringify(data));
      return data;
    }
  } catch (e) {
    console.warn("Failed to fetch from remote API, falling back to local storage.", e);
  }

  // Fallback to local
  const localData = localStorage.getItem(`bible_app_state_${uid}`);
  if (localData) {
    return JSON.parse(localData);
  }

  // Brand new user
  const newState = { uid, ...DEFAULT_STATE };
  await saveState(newState);
  return newState;
}

export async function saveState(state: AppState): Promise<void> {
  // Always save locally first for instant feedback
  localStorage.setItem(`bible_app_state_${state.uid}`, JSON.stringify(state));

  // Try to sync remotely
  try {
    await fetch('/api/data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(state)
    });
  } catch (e) {
    console.warn("Failed to sync state to remote API.", e);
  }
}
