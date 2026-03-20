import './style.css';
import type { AppState } from './utils/storage';
import { fetchState, getUID, saveState } from './utils/storage';
import { canPracticeToday, getMaskedText, getReviewDueVerses } from './utils/memorization';

// State
let appState: AppState | null = null;
let currentUid: string = '';
let practiceStepIndex: number = 0;
let practiceSteps: string[] = [];

// Practice steps per day range (Feature 2)
const PRACTICE_STEPS: Record<string, string[]> = {
  familiarization: [
    '📖 Read the passage aloud — first time through.',
    '📖 Read it aloud again — second time. Notice the rhythm.',
    '📖 Third read-aloud. Start connecting phrases.',
    '📖 Final read-aloud — read it like you mean every word.',
    '✍️ Write it out by hand from beginning to end.',
  ],
  partialRecall: [
    '🧠 Cover the text and try to say the verse from memory.',
    '👁️ Check the hints — tap any blanked word you truly forgot.',
    '📖 Read the full verse once more to reinforce what you missed.',
  ],
  advancedRecall: [
    '🧠 Recite the entire passage without looking at the screen.',
    '👁️ Only tap a word if you are completely stuck — resist the urge!',
    '📖 Read it through once from beginning to end to confirm.',
  ],
  fullRecall: [
    '🏆 Recite the entire passage perfectly from memory — no hints.',
    '✅ If you got it, you\'re done! Mark it complete.',
  ],
};

// Daily method descriptions for Home briefing (Feature 1)
function getDailyMethodSummary(day: number): { label: string; description: string } {
  if (day <= 2) return {
    label: 'Familiarization',
    description: 'Read it aloud 4×, write it out, connect words to a mental image.',
  };
  if (day <= 4) return {
    label: 'Partial Recall',
    description: 'Try to recite from memory — use blanked hints only if truly stuck.',
  };
  if (day <= 6) return {
    label: 'Advanced Recall',
    description: 'Recite without any visual aids before checking for gaps.',
  };
  return {
    label: 'Full Recall',
    description: 'Say the entire passage perfectly from memory. You\'ve got this.',
  };
}

// DOM Elements
const views = {
  loading: document.getElementById('loading-view') as HTMLDivElement,
  home: document.getElementById('home-view') as HTMLDivElement,
  selection: document.getElementById('selection-view') as HTMLDivElement,
  practice: document.getElementById('practice-view') as HTMLDivElement,
  progress: document.getElementById('progress-view') as HTMLDivElement,
  profile: document.getElementById('profile-view') as HTMLDivElement,
};

const AVATARS = ['🕊️', '📖', '🌿', '✝️', '👑', '🛡️', '🍇', '🍞', '🐟', '🐑'];

// --- Initialization ---
async function init() {
  currentUid = getUID();
  console.log("App loaded for UID:", currentUid);
  
  // Update Profile Widget
  const profileUidEl = document.getElementById('profile-uid');
  if (profileUidEl) {
      profileUidEl.innerText = currentUid;
  }
  
  appState = await fetchState(currentUid);
  
  if (!appState.avatar) {
      appState.avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
      await saveState(appState);
  }

  updateProfileHeader();
  
  if (appState.activeVerse) {
      renderHomeView();
  } else if (appState.memorizedVerses.length > 0) {
      // Returning user with no active verse — show the resting home screen
      renderHomeView();
  } else {
      switchView('selection');
  }
}

// --- View Rendering ---
function switchView(viewName: keyof typeof views) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  views[viewName].classList.add('active');
}

function updateProfileHeader() {
  if (!appState) return;
  const avatarEl = document.getElementById('profile-avatar');
  const nameEl = document.getElementById('profile-name');
  if (avatarEl) avatarEl.innerText = appState.avatar || '🕊️';
  if (nameEl) nameEl.innerText = appState.userName || 'Anonymous';
}

function renderHomeView() {
  if (!appState) return;

  const { activeVerse } = appState;

  // Greeting
  const greetingEl = document.getElementById('home-greeting');
  if (greetingEl) {
    const name = appState.userName ? `, ${appState.userName}` : '';
    greetingEl.innerText = `Welcome back${name} \u{1F44B}`;
  }

  const restingEl = document.getElementById('home-resting')!;
  const activeEl = document.getElementById('home-active')!;

  if (!activeVerse) {
    // --- Resting state ---
    restingEl.style.display = 'block';
    activeEl.style.display = 'none';

    const countEl = document.getElementById('home-resting-count');
    if (countEl) countEl.innerText = appState.memorizedVerses.length.toString();

    // Surface review-due banner in resting mode
    const dueVerses = getReviewDueVerses(appState.memorizedVerses);
    const reviewBannerEl = document.getElementById('home-review-due');
    const reviewListEl = document.getElementById('home-review-due-list');
    if (reviewBannerEl && reviewListEl) {
      if (dueVerses.length > 0) {
        reviewListEl.innerHTML = dueVerses.map(v =>
          `<div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:0.9rem; font-weight:500; color:var(--text-primary);">${v.reference}</span>
            <button class="review-due-btn" data-ref="${v.reference}" data-translation="${v.translation || 'esv'}" style="font-size:0.78rem; padding:0.25rem 0.6rem; background:var(--accent-color); color:white; border:none; border-radius:6px; cursor:pointer;">Review \u2192</button>
          </div>`
        ).join('');
        reviewBannerEl.style.display = 'block';
        reviewListEl.onclick = async (e) => {
          const btn = (e.target as HTMLElement).closest('.review-due-btn') as HTMLElement | null;
          if (!btn) return;
          await reviewVerseAndStamp(btn.dataset.ref!, btn.dataset.translation || 'esv');
        };
      } else {
        reviewBannerEl.style.display = 'none';
      }
    }

    switchView('home');
    return;
  }

  // --- Active verse state ---
  restingEl.style.display = 'none';
  activeEl.style.display = 'block';

  document.getElementById('home-text')!.innerText = activeVerse.text || '';
  document.getElementById('home-ref')!.innerText = activeVerse.reference;
  document.getElementById('home-streak')!.innerText = `Day ${activeVerse.day} of 7`;

  // Today's Method pill
  const method = getDailyMethodSummary(activeVerse.day);
  const methodLabelEl = document.getElementById('home-method-label');
  const methodDescEl = document.getElementById('home-method-desc');
  if (methodLabelEl) methodLabelEl.innerText = method.label;
  if (methodDescEl) methodDescEl.innerText = method.description;

  const btnPractice = document.getElementById('btn-practice') as HTMLButtonElement;
  if (canPracticeToday(activeVerse)) {
      btnPractice.innerText = 'Practice Now';
      btnPractice.disabled = false;
  } else {
      btnPractice.innerText = 'Completed for Today \u2713';
      btnPractice.disabled = true;
  }

  const isEsv = (activeVerse as any).translation === 'esv';
  document.querySelectorAll('.esv-disclaimer').forEach((el) => {
      (el as HTMLElement).style.display = isEsv ? 'block' : 'none';
  });

  switchView('home');
}


function renderPracticeView(overrideVerse?: import('./utils/storage').VerseState) {
    const verse = overrideVerse || appState?.activeVerse;
    if (!verse) return;

    const maskedText = getMaskedText(verse);
    const textContainer = document.getElementById('practice-text')!;
    const instructions = document.getElementById('practice-instructions')!;
    const streakEl = document.getElementById('practice-streak')!;

    // Show/hide review banner
    let reviewBanner = document.getElementById('review-mode-banner');
    if (!reviewBanner) {
        reviewBanner = document.createElement('div');
        reviewBanner.id = 'review-mode-banner';
        reviewBanner.style.cssText = 'background: var(--accent-color); color: white; text-align: center; font-size: 0.8rem; font-weight: 600; padding: 0.4rem 0; border-radius: 6px; margin-bottom: 0.75rem; letter-spacing: 0.03em;';
        reviewBanner.innerText = '🔍 Review Mode — not counted as today\'s practice';
        streakEl.parentElement!.insertAdjacentElement('afterend', reviewBanner);
    }
    reviewBanner.style.display = overrideVerse ? 'block' : 'none';

    // Show/hide normal action buttons vs review back button
    const normalActions = document.getElementById('practice-normal-actions')!;
    const reviewActions = document.getElementById('practice-review-actions')!;
    normalActions.style.display = overrideVerse ? 'none' : 'flex';
    reviewActions.style.display = overrideVerse ? 'flex' : 'none';

    // Convert masked string back to HTML spans for tapping
    textContainer.innerHTML = '';
    const words = maskedText.split(/(\s+)/);
    words.forEach((word, index) => {
        if (!word.trim()) {
            textContainer.appendChild(document.createTextNode(word));
            return;
        }
        const span = document.createElement('span');
        span.innerText = word;
        if (word.includes('*')) {
            span.classList.add('masked-word');
            span.onclick = () => {
                const origWords = (verse.text || '').split(/(\s+)/);
                span.innerText = origWords[index];
                span.classList.remove('masked-word');
                span.onclick = null;
            };
        }
        textContainer.appendChild(span);
    });

    document.getElementById('practice-ref')!.innerText = verse.reference;
    streakEl.innerText = overrideVerse ? 'Review' : `Day ${verse.day} Practice`;

    // Step flow (Feature 2) — only for active (non-review) practice
    const stepFlowEl = document.getElementById('practice-step-flow')!;
    if (overrideVerse) {
        stepFlowEl.style.display = 'none';
        instructions.innerText = 'Reviewing from memory. Tap masked words to reveal them.';
    } else {
        // Determine which step list to use
        let stepsKey: string;
        if (verse.day <= 2)      stepsKey = 'familiarization';
        else if (verse.day <= 4) stepsKey = 'partialRecall';
        else if (verse.day <= 6) stepsKey = 'advancedRecall';
        else                      stepsKey = 'fullRecall';

        practiceSteps = PRACTICE_STEPS[stepsKey];
        practiceStepIndex = 0;

        const method = getDailyMethodSummary(verse.day);
        instructions.innerText = `${method.label}: work through each step below.`;
        stepFlowEl.style.display = 'block';
        renderCurrentStep();

        // Hide the complete button until all steps done
        document.getElementById('btn-complete-practice')!.style.display = 'none';
    }

    const isEsv = (verse as any).translation === 'esv';
    document.querySelectorAll('.esv-disclaimer').forEach((el) => {
        (el as HTMLElement).style.display = isEsv ? 'block' : 'none';
    });

    switchView('practice');
}

function renderCurrentStep() {
    const total = practiceSteps.length;
    const current = practiceStepIndex;

    document.getElementById('step-current')!.innerText = (current + 1).toString();
    document.getElementById('step-total')!.innerText = total.toString();
    document.getElementById('step-text')!.innerText = practiceSteps[current];

    const fillPct = ((current) / total) * 100;
    (document.getElementById('step-progress-fill') as HTMLElement).style.width = `${fillPct}%`;

    const nextBtn = document.getElementById('btn-next-step') as HTMLButtonElement;
    const isLast = current === total - 1;
    nextBtn.innerText = isLast ? 'Mark All Steps Done ✓' : 'Next Step →';
}

async function reviewVerseAndStamp(reference: string, translation: string) {
    // Build a Day-7 (full-mask) temp verse state with text fetched from API
    const apiUrl = translation === 'esv'
        ? `/api/esv?q=${encodeURIComponent(reference)}`
        : `https://bible-api.com/${encodeURIComponent(reference)}`;
    try {
        const res = await fetch(apiUrl);
        if (!res.ok) throw new Error('API error');
        const data = await res.json();
        const tempVerse: import('./utils/storage').VerseState = {
            reference: data.reference || reference,
            text: data.text.trim(),
            day: 7,
            lastPracticed: null,
            translation,
            completed: true,
        };
        renderPracticeView(tempVerse);

        // Stamp lastReviewedDate on the saved record (Feature 3)
        if (appState) {
            const savedVerse = appState.memorizedVerses.find(v => v.reference === reference);
            if (savedVerse) {
                savedVerse.lastReviewedDate = new Date().toISOString();
                await saveState(appState);
            }
        }
    } catch {
        alert('Could not fetch this verse for review. Please try again.');
    }
}

// Keep original for backward compat (progress view still uses this name)
const reviewVerseTemporarily = reviewVerseAndStamp;

function renderProgressView() {
    if (!appState) return;

    const completedVerses = appState.memorizedVerses;
    const activeVerse = appState.activeVerse;
    
    // Total completed count
    document.getElementById('progress-count')!.innerText = completedVerses.length.toString();

    const listContainer = document.getElementById('progress-list')!;
    listContainer.innerHTML = '';

    // Helper to calculate days between two dates
    const getDaysBetween = (startStr?: string, endStr?: string | null) => {
        if (!startStr) return 'Unknown';
        const start = new Date(startStr).getTime();
        const end = endStr ? new Date(endStr).getTime() : new Date().getTime();
        const diffMs = Math.max(0, end - start);
        const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
        return `${days} Day${days === 1 ? '' : 's'}`;
    };

    // Helper to render a verse card
    const createCard = (verse: typeof activeVerse, isActive: boolean) => {
        if (!verse) return '';
        
        const dateStr = verse.completedDate 
            ? new Date(verse.completedDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
            : 'Present';
            
        const practiceMetric = getDaysBetween(verse.startedDate, isActive ? verse.lastPracticed : verse.completedDate);
        
        const transTag = verse.translation ? `<span style="font-size: 0.7rem; background: var(--bg-color); padding: 0.1rem 0.3rem; border-radius: 4px; margin-left: 0.5rem; vertical-align: middle;">${verse.translation.toUpperCase()}</span>` : '';
        const metricPill = `<span style="font-size: 0.75rem; background: var(--border-color); color: var(--text-primary); padding: 0.2rem 0.5rem; border-radius: 12px; font-weight: 500;">🗓️ ${practiceMetric} Practice</span>`;

        const actionBtn = isActive
            ? `<button class="progress-practice-btn" data-ref="${verse.reference}" data-translation="${verse.translation || 'web'}" data-active="true" style="margin-top: 0.75rem; width: 100%; font-size: 0.85rem; padding: 0.4rem;">Practice Now →</button>`
            : `<button class="progress-practice-btn" data-ref="${verse.reference}" data-translation="${verse.translation || 'web'}" data-active="false" style="margin-top: 0.75rem; width: 100%; font-size: 0.85rem; padding: 0.4rem; background: transparent; border: 1px solid var(--accent-color); color: var(--accent-color);">Review from Memory →</button>`;

        return `
            <div class="progress-item">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                    <div class="progress-item-ref">${verse.reference}${transTag}</div>
                    ${metricPill}
                </div>
                ${isActive && verse.text ? `<div class="progress-item-text">"${verse.text}"</div>` : ''}
                <div class="progress-item-meta">${isActive ? `Currently on Day ${verse.day} of 7` : `Memorized on ${dateStr}`}</div>
                ${actionBtn}
            </div>
        `;
    };

    if (completedVerses.length === 0 && !activeVerse) {
        listContainer.innerHTML = `
            <div style="text-align: center; color: var(--text-secondary); padding: 2rem 0;">
                You aren't prioritizing any verses yet. Keep practicing!
            </div>
        `;
    } else {
        // Render Active Verse Section
        if (activeVerse) {
            const sectionHeader = document.createElement('h3');
            sectionHeader.style.cssText = 'font-size: 1rem; color: var(--text-secondary); margin: 0 0 0.5rem 0.5rem;';
            sectionHeader.innerText = 'Currently Learning';
            listContainer.appendChild(sectionHeader);
            
            const activeContainer = document.createElement('div');
            activeContainer.innerHTML = createCard(activeVerse, true);
            listContainer.appendChild(activeContainer);
        }

        // Render Completed Verses Section
        if (completedVerses.length > 0) {
            const sectionHeader = document.createElement('h3');
            sectionHeader.style.cssText = 'font-size: 1rem; color: var(--text-secondary); margin: 1.5rem 0 0.5rem 0.5rem;';
            sectionHeader.innerText = 'Memorized (Completed)';
            listContainer.appendChild(sectionHeader);

            // Sort newest first
            const sorted = [...completedVerses].sort((a, b) => {
                const dateA = a.completedDate ? new Date(a.completedDate).getTime() : 0;
                const dateB = b.completedDate ? new Date(b.completedDate).getTime() : 0;
                return dateB - dateA;
            });

            sorted.forEach(verse => {
                const item = document.createElement('div');
                item.innerHTML = createCard(verse, false);
                listContainer.appendChild(item);
            });
        }
    }

    // Delegated click handler for Practice/Review buttons
    listContainer.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest('.progress-practice-btn') as HTMLElement | null;
        if (!btn) return;
        const ref = btn.dataset.ref!;
        const translation = btn.dataset.translation || 'web';
        const isActive = btn.dataset.active === 'true';
        if (isActive) {
            renderPracticeView();
        } else {
            reviewVerseTemporarily(ref, translation);
        }
    });

    switchView('progress');
}

function renderProfileView() {
    if (!appState) return;
    
    document.getElementById('profile-view-avatar')!.innerText = appState.avatar || '🕊️';
    (document.getElementById('input-username') as HTMLInputElement).value = appState.userName || '';
    document.getElementById('profile-view-uid')!.innerText = currentUid;

    // Populate translation preference select (Feature 4)
    const transSelect = document.getElementById('profile-translation-select') as HTMLSelectElement;
    if (transSelect) transSelect.value = appState.preferredTranslation || 'esv';
    
    switchView('profile');
}

// --- Event Listeners ---
document.getElementById('btn-new-verse')?.addEventListener('click', () => {
  switchView('selection');
});

document.getElementById('btn-start-new-verse')?.addEventListener('click', () => {
  switchView('selection');
});

document.getElementById('btn-progress-resting')?.addEventListener('click', () => {
  renderProgressView();
});

document.getElementById('btn-practice')?.addEventListener('click', () => {
  renderPracticeView();
});

document.getElementById('btn-back-home')?.addEventListener('click', () => {
  renderHomeView();
});

document.getElementById('btn-done-review')?.addEventListener('click', () => {
  renderProgressView();
});

document.getElementById('btn-progress-home')?.addEventListener('click', () => {
  renderProgressView();
});

document.getElementById('btn-progress-selection')?.addEventListener('click', () => {
  renderProgressView();
});

document.getElementById('btn-back-from-progress')?.addEventListener('click', () => {
  if (appState?.activeVerse) {
    renderHomeView();
  } else {
    switchView('selection');
  }
});

document.getElementById('btn-complete-practice')?.addEventListener('click', async () => {
    if (!appState?.activeVerse) return;

    appState.activeVerse.lastPracticed = new Date().toISOString();
    appState.activeVerse.day += 1;

    if (appState.activeVerse.day > 7) {
        appState.activeVerse.completed = true;
        appState.activeVerse.completedDate = new Date().toISOString();
        
        // Remove text to save storage
        const memorizedCopy = {...appState.activeVerse};
        delete memorizedCopy.text;
        
        appState.memorizedVerses.push(memorizedCopy);
        alert('Congratulations! You completed the 7-day memory cycle!');
        appState.activeVerse = null;
    }

    await saveState(appState);
    init(); // Re-render root state
});

// Next Step button (Feature 2)
document.getElementById('btn-next-step')?.addEventListener('click', () => {
    practiceStepIndex += 1;
    if (practiceStepIndex >= practiceSteps.length) {
        // All steps done — hide step flow, reveal complete button
        document.getElementById('practice-step-flow')!.style.display = 'none';
        const completeBtn = document.getElementById('btn-complete-practice')!;
        completeBtn.style.display = 'block';
        // Fill progress bar to 100%
        (document.getElementById('step-progress-fill') as HTMLElement).style.width = '100%';
    } else {
        renderCurrentStep();
    }
});

async function fetchFromBibleApi(reference: string) {
    const btn = document.getElementById('btn-fetch-custom') as HTMLButtonElement;
    const preferredTranslation = appState?.preferredTranslation ?? 'esv';

    const origText = btn.innerText;
    btn.innerText = 'Loading...';
    btn.disabled = true;

    // Try preferred translation, then fall back to WEB if ESV endpoint is unavailable
    async function tryFetch(translation: string): Promise<{ data: any; translation: string }> {
        const apiUrl = translation === 'esv'
            ? `/api/esv?q=${encodeURIComponent(reference)}`
            : `https://bible-api.com/${encodeURIComponent(reference)}`;
        const res = await fetch(apiUrl);
        if (!res.ok) throw new Error(`${translation} fetch failed: ${res.status}`);
        const data = await res.json();
        return { data, translation };
    }

    try {
        let result: { data: any; translation: string };
        try {
            result = await tryFetch(preferredTranslation);
        } catch {
            // ESV endpoint unavailable (e.g. Vite dev mode) — silently retry with WEB
            if (preferredTranslation === 'esv') {
                result = await tryFetch('web');
            } else {
                throw new Error('Could not reach bible-api.com');
            }
        }

        const { data, translation } = result;
        
        if (appState) {
            appState.activeVerse = {
                reference: data.reference,
                text: data.text.trim(),
                day: 1,
                lastPracticed: null,
                translation: translation,
                startedDate: new Date().toISOString(),
                completed: false
            };
            await saveState(appState);
            renderHomeView();
        }
    } catch (e) {
        alert("Could not find that reference. Please try again.");
    } finally {
        btn.innerText = origText;
        btn.disabled = false;
    }
}

document.getElementById('btn-fetch-custom')?.addEventListener('click', () => {
    const input = document.getElementById('custom-ref') as HTMLInputElement;
    if (input.value) {
        fetchFromBibleApi(input.value);
    }
});

document.getElementById('recommended-list')?.addEventListener('click', (e) => {
    const li = (e.target as HTMLElement).closest('li');
    if (li) {
        fetchFromBibleApi(li.innerText.trim());
    }
});

document.getElementById('profile-btn')?.addEventListener('click', () => {
    renderProfileView();
});

document.getElementById('btn-back-from-profile')?.addEventListener('click', () => {
    if (appState?.activeVerse) {
        renderHomeView();
    } else {
        switchView('selection');
    }
});

document.getElementById('btn-save-profile')?.addEventListener('click', async () => {
    if (!appState) return;
    const input = document.getElementById('input-username') as HTMLInputElement;
    appState.userName = input.value.trim();
    // Save translation preference (Feature 4)
    const transSelect = document.getElementById('profile-translation-select') as HTMLSelectElement;
    if (transSelect) appState.preferredTranslation = transSelect.value as 'esv' | 'web';
    await saveState(appState);
    updateProfileHeader();
    document.getElementById('btn-back-from-profile')?.click();
});

document.getElementById('btn-copy-uid')?.addEventListener('click', () => {
    if (currentUid) {
        navigator.clipboard.writeText(currentUid).then(() => {
            alert(`Copied Sync ID to clipboard: ${currentUid}\n\nYou can use this ID to sync your progress on another device by appending ?uid=${currentUid} to the URL.`);
        });
    }
});

let resetRequested = false;
document.getElementById('btn-reset-uid')?.addEventListener('click', (e) => {
    e.preventDefault();
    const btn = e.target as HTMLButtonElement;
    
    if (!resetRequested) {
        resetRequested = true;
        const originalText = btn.innerText;
        btn.innerText = "Are you sure? Click again to Erase Data.";
        btn.style.background = "#ef4444";
        btn.style.color = "white";
        
        setTimeout(() => {
            resetRequested = false;
            btn.innerText = originalText;
            btn.style.background = "rgba(239, 68, 68, 0.1)";
            btn.style.color = "#ef4444";
        }, 4000);
        return;
    }

    // Erase Confirmed
    resetRequested = false;
    btn.innerText = "Erase Data & Reset Progress";
    btn.style.background = "rgba(239, 68, 68, 0.1)";
    btn.style.color = "#ef4444";
    
    localStorage.removeItem('bible_app_uid');
    window.history.replaceState({}, document.title, window.location.pathname);
    appState = null;
    init().then(() => {
        renderProfileView(); // Re-render to show the new UID immediately
    });
});

document.getElementById('btn-dev-skip')?.addEventListener('click', async () => {
    if (!appState?.activeVerse) return;
    
    // Increment the day and fake the practice date to yesterday so they can practice again immediately
    appState.activeVerse.day += 1;
    
    if (appState.activeVerse.day > 7) {
        appState.activeVerse.completed = true;
        appState.activeVerse.completedDate = new Date().toISOString();
        
        // Remove text to save storage
        const memorizedCopy = {...appState.activeVerse};
        delete memorizedCopy.text;
        
        appState.memorizedVerses.push(memorizedCopy);
        alert('Congratulations! You completed the 7-day memory cycle! (Fast-Forwarded)');
        appState.activeVerse = null;
    } else {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        appState.activeVerse.lastPracticed = yesterday.toISOString();
    }
    
    await saveState(appState);
    init(); // Re-render root state, which will unlock the practice button
});

// Start the app
init();
