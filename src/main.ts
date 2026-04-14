import './style.css';
import type { AppState } from './utils/storage';
import { fetchState, getUID, saveState } from './utils/storage';
import { canPracticeToday, getMaskedText, getReviewDueVerses } from './utils/memorization';

// State
let appState: AppState | null = null;
let currentUid: string = '';
let practiceStepIndex: number = 0;
let practiceSteps: PracticeStep[] = [];

// Voice state
let activeAudio: HTMLAudioElement | null = null;
let speechSynth: SpeechSynthesisUtterance | null = null;
let recognition: any = null; // SpeechRecognition instance (may be null on unsupported browsers)
let isRecording = false;
let currentRecitationVerse: string = ''; // verse text being recited against

// --- Voice: Audio Playback ---

/** Returns true if the SpeechRecognition API is available in this browser. */
function hasSpeechRecognition(): boolean {
  return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

/** Returns the label to show on the audio button based on which audio source is used. */
function audioSourceLabel(translation: string, verb: 'Listen' | 'Play' = 'Listen'): string {
  const t = translation ? translation.toUpperCase() : 'ESV';
  return `▶ ${verb} (${t})`;
}

/**
 * Play the passage audio. For ESV, streams from our Cloudflare proxy.
 * For WEB / NIV / MSG, tries Google TTS proxy, and falls back to browser SpeechSynthesis.
 */
function playAudio(
  text: string,
  reference: string,
  translation: string,
  btnEl: HTMLButtonElement
) {
  // Stop anything already playing
  stopAudio();

  const originalLabel = btnEl.innerText;

  const onDone = () => {
    btnEl.innerText = originalLabel;
    activeAudio = null;
    speechSynth = null;
  };

  if (translation === 'esv') {
    btnEl.innerText = '📢 Stop (ESV)';
    // Use ESV audio API proxy — returns an MP3 stream
    const audio = new Audio(`/api/esv-audio?q=${encodeURIComponent(reference)}`);
    activeAudio = audio;
    
    let fallbackTriggered = false;
    const triggerFallback = () => {
      if (fallbackTriggered) return;
      fallbackTriggered = true;
      activeAudio = null;
      console.warn("ESV audio failed. Falling back to web speech.");
      useSpeechSynthesis(text, onDone, btnEl);
    };

    audio.addEventListener('ended', onDone);
    audio.addEventListener('error', triggerFallback);
    audio.play().catch(triggerFallback);
  } else {
    btnEl.innerText = '🎙️ Stop (Google TTS)';
    const audio = new Audio(`/api/google-tts?text=${encodeURIComponent(text)}`);
    activeAudio = audio;

    let fallbackTriggered = false;
    const triggerFallback = () => {
      if (fallbackTriggered) return;
      fallbackTriggered = true;
      activeAudio = null;
      console.error("Google TTS failed. Please check API key and GCP project settings.");
      onDone();
    };

    audio.addEventListener('ended', onDone);
    audio.addEventListener('error', triggerFallback);
    audio.play().catch(triggerFallback);
  }
}

function playLocalSpeech(text: string, btnEl: HTMLButtonElement) {
  stopAudio();
  const originalLabel = btnEl.innerText;
  const onDone = () => {
    btnEl.innerText = originalLabel;
    speechSynth = null;
  };
  useSpeechSynthesis(text, onDone, btnEl);
}

function useSpeechSynthesis(text: string, onDone: () => void, btnEl: HTMLButtonElement) {
  if (!window.speechSynthesis) {
    onDone();
    return;
  }
  btnEl.innerText = '🤖 Stop (Local Browser)';
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.85;
  utterance.lang = 'en-US';

  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    const preferredVoice = voices.find(v => 
      v.name.includes('Google UK English Male') ||
      v.name.includes('Alex') ||
      v.name.includes('Daniel') ||
      v.name.includes('Fred') ||
      (v.lang === 'en-US' && !v.localService && v.name.includes('Male'))
    ) || voices.find(v => v.lang.startsWith('en-'));

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
  }

  utterance.onend = onDone;
  utterance.onerror = onDone;
  speechSynth = utterance;
  window.speechSynthesis.speak(utterance);
}

function stopAudio() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio = null;
  }
  if (speechSynth) {
    window.speechSynthesis?.cancel();
    speechSynth = null;
  }
}

// --- Voice: Recitation & Scoring ---

/**
 * Normalise a string for loose word comparison:
 * lowercase, strip punctuation and numbers, collapse whitespace.
 */
function normaliseWords(str: string): string[] {
  return str
    .toLowerCase()
    .replace(/[^a-z\s']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/**
 * Returns a 0–1 score and an array of { word, correct } objects for
 * rendering the word-diff. Uses a sliding window so small insertions /
 * deletions don't cascade failures through the rest of the verse.
 */
function scoreTranscript(
  spoken: string,
  expected: string
): { score: number; diff: Array<{ word: string; correct: boolean }> } {
  const spokenWords = normaliseWords(spoken);
  const expectedWords = normaliseWords(expected);
  const diff: Array<{ word: string; correct: boolean }> = [];

  let si = 0; // spoken index
  let correct = 0;

  for (let ei = 0; ei < expectedWords.length; ei++) {
    const exp = expectedWords[ei];
    // Look ahead up to 3 positions in the spoken array to allow small skips
    let found = false;
    for (let offset = 0; offset <= 3 && si + offset < spokenWords.length; offset++) {
      if (spokenWords[si + offset] === exp) {
        si += offset + 1;
        correct++;
        diff.push({ word: exp, correct: true });
        found = true;
        break;
      }
    }
    if (!found) {
      diff.push({ word: exp, correct: false });
    }
  }

  return { score: correct / expectedWords.length, diff };
}

function showRecitationResult(spoken: string) {
  const resultEl = document.getElementById('recitation-result')!;
  const fillEl = document.getElementById('recitation-score-fill') as HTMLElement;
  const labelEl = document.getElementById('recitation-score-label')!;
  const diffEl = document.getElementById('recitation-diff')!;

  const { score, diff } = scoreTranscript(spoken, currentRecitationVerse);
  const pct = Math.round(score * 100);

  // Color the score bar: red → amber → green
  const barColor = pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';
  fillEl.style.width = `${pct}%`;
  fillEl.style.background = barColor;

  const emoji = pct >= 80 ? '🏆' : pct >= 50 ? '👍' : '💪';
  labelEl.innerText = `${emoji} ${pct}% match`;
  labelEl.style.color = barColor;

  // Word-diff display
  diffEl.innerHTML = diff
    .map(({ word, correct }) =>
      correct
        ? `<span style="color: #22c55e; font-weight: 500;">${word}</span>`
        : `<span style="color: #ef4444; text-decoration: underline;">${word}</span>`
    )
    .join(' ');

  resultEl.style.display = 'block';
}

function startRecitation(btnEl: HTMLButtonElement) {
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  // Reset result area
  document.getElementById('recitation-result')!.style.display = 'none';

  recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  // continuous=false works on iOS too; speech stops after natural pause
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    isRecording = true;
    btnEl.innerText = '⏹ Stop Recording';
    btnEl.style.background = '#ef4444';
    btnEl.style.color = 'white';
  };

  recognition.onresult = (event: any) => {
    const transcript = Array.from(event.results as SpeechRecognitionResultList)
      .map((r: SpeechRecognitionResult) => r[0].transcript)
      .join(' ');
    showRecitationResult(transcript);
  };

  recognition.onend = () => {
    isRecording = false;
    btnEl.innerText = '🎙️ Start Reciting';
    btnEl.style.background = '';
    btnEl.style.color = '';
  };

  recognition.onerror = (e: any) => {
    console.warn('SpeechRecognition error:', e.error);
    isRecording = false;
    btnEl.innerText = '🎙️ Start Reciting';
    btnEl.style.background = '';
    btnEl.style.color = '';
  };

  recognition.start();
}

function stopRecitation(btnEl: HTMLButtonElement) {
  if (recognition) {
    recognition.stop();
    recognition = null;
  }
  isRecording = false;
  btnEl.innerText = '🎙️ Start Reciting';
  btnEl.style.background = '';
  btnEl.style.color = '';
}

// Step types for the practice flow
type PracticeStepType = 'instruction' | 'audio' | 'recite';
interface PracticeStep {
  text: string;
  type: PracticeStepType;
  optional?: boolean; // if true, shows a Skip button instead of Next
}

// Practice steps per day range (Feature 2)
// 'audio' steps play the passage inline; 'recite' steps open the mic inline.
// Both are optional (skip-able) so users without headphones/mic aren't blocked.
const PRACTICE_STEPS: Record<string, PracticeStep[]> = {
  familiarization: [
    { type: 'audio',       text: '🔊 Listen to the passage — pay close attention to the rhythm and phrasing before reading.', optional: true },
    { type: 'instruction', text: '📖 Read the passage aloud — go slowly for the first time through to ensure every word is correct.' },
    { type: 'instruction', text: '📖 Read it aloud again — this time, try to group words together into natural phrases.' },
    { type: 'instruction', text: '📖 Third read-aloud. Start mentally connecting the phrases to visual images or concepts in your mind.' },
    { type: 'instruction', text: '📖 Final read-aloud — read it with emphasis and feeling, as if you were teaching it to someone else.' },
    { type: 'instruction', text: '✍️ Write it out by hand from beginning to end on a physical piece of paper. This dramatically improves retention.' },
  ],
  partialRecall: [
    { type: 'recite',      text: '🎙️ Try reciting the verse from memory — no pressure, just a first attempt to see what stuck.', optional: true },
    { type: 'instruction', text: '🧠 Look away from the screen and try your best to speak the entire passage out loud from memory.' },
    { type: 'instruction', text: '👁️ Check the screen for hints — only tap a blank word if you are truly stuck and cannot remember it.' },
    { type: 'instruction', text: '📖 Read the full verse aloud once more to reinforce the specific words that you missed.' },
  ],
  advancedRecall: [
    { type: 'recite',      text: '🎙️ Recite the entire passage — try to say the whole thing aloud confidently before checking the screen.', optional: true },
    { type: 'instruction', text: '🧠 Recite the entire passage out loud without looking at the screen at all.' },
    { type: 'instruction', text: '👁️ Tap a word only if you absolutely must. Resist the urge to peek — let your brain work to recall it!' },
    { type: 'instruction', text: '📖 Read it through out loud once from beginning to end to confirm you had it completely right.' },
  ],
  fullRecall: [
    { type: 'recite',      text: '🎙️ Say the entire passage flawlessly from memory — record your attempt and aim for 100%.', optional: true },
    { type: 'instruction', text: '🏆 Recite the entire passage out loud perfectly from memory. Don\'t rely on any hints or peeking.' },
    { type: 'instruction', text: '✅ If you got every single word right, you\'re done! Mark your practice complete with confidence.' },
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
  const homeTrans = ((activeVerse as any).translation || 'esv') as string;
  document.getElementById('home-ref')!.innerText = `${activeVerse.reference} (${homeTrans.toUpperCase()})`;
  document.getElementById('home-streak')!.innerText = `Day ${activeVerse.day} of 7`;

  // Audio button shows the audio source, not the text translation
  const homeAudioBtn = document.getElementById('btn-home-audio') as HTMLButtonElement | null;
  const homeAudioWebBtn = document.getElementById('btn-home-audio-web') as HTMLButtonElement | null;
  if (homeAudioBtn) {
    homeAudioBtn.innerText = audioSourceLabel(homeTrans);
  }
  if (homeAudioWebBtn) {
    if (homeTrans !== 'esv') {
      homeAudioWebBtn.style.display = 'inline-block';
      homeAudioWebBtn.innerText = '▶ Listen (Web)';
    } else {
      homeAudioWebBtn.style.display = 'none';
    }
  }

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

    streakEl.innerText = overrideVerse ? 'Review' : `Day ${verse.day} Practice`;

    // Reference shows text translation; audio button shows audio source
    const practiceTrans = ((verse as any).translation || 'esv') as string;
    document.getElementById('practice-ref')!.innerText = `${verse.reference} (${practiceTrans.toUpperCase()})`;
    const practiceAudioBtn = document.getElementById('btn-practice-audio') as HTMLButtonElement | null;
    const practiceAudioWebBtn = document.getElementById('btn-practice-audio-web') as HTMLButtonElement | null;
    if (practiceAudioBtn) {
      practiceAudioBtn.innerText = audioSourceLabel(practiceTrans);
    }
    if (practiceAudioWebBtn) {
      if (practiceTrans !== 'esv') {
        practiceAudioWebBtn.style.display = 'inline-block';
        practiceAudioWebBtn.innerText = '▶ Listen (Web)';
      } else {
        practiceAudioWebBtn.style.display = 'none';
      }
    }

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
        // On browsers without SpeechRecognition (Firefox etc.), strip out recite steps
        // so the step count and flow make sense without the mic functionality.
        if (!hasSpeechRecognition()) {
            practiceSteps = practiceSteps.filter(s => s.type !== 'recite');
        }
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

    // Store verse text for recitation scoring (used by inline recite steps)
    currentRecitationVerse = verse.text || '';

    // Stop any leftover audio when entering the practice view
    stopAudio();

    switchView('practice');
}

function renderCurrentStep() {
    const total = practiceSteps.length;
    const current = practiceStepIndex;
    const step = practiceSteps[current];

    document.getElementById('step-current')!.innerText = (current + 1).toString();
    document.getElementById('step-total')!.innerText = total.toString();
    document.getElementById('step-text')!.innerText = step.text;

    const fillPct = (current / total) * 100;
    (document.getElementById('step-progress-fill') as HTMLElement).style.width = `${fillPct}%`;

    const nextBtn = document.getElementById('btn-next-step') as HTMLButtonElement;
    const isLast = current === total - 1;

    // Hide/show the inline audio player and recite panel based on step type
    const inlineAudio = document.getElementById('step-inline-audio')!;
    const inlineRecite = document.getElementById('step-inline-recite')!;
    inlineAudio.style.display = 'none';
    inlineRecite.style.display = 'none';

    if (step.type === 'audio') {
        inlineAudio.style.display = 'block';
        // Reset the inline play button label
        const playBtn = document.getElementById('btn-step-play') as HTMLButtonElement;
        const playWebBtn = document.getElementById('btn-step-play-web') as HTMLButtonElement | null;
        const verse = appState?.activeVerse;
        if (playBtn && verse) {
            const trans = (verse as any).translation || 'esv';
            playBtn.innerText = audioSourceLabel(trans, 'Play');
            if (playWebBtn) {
                if (trans !== 'esv') {
                    playWebBtn.style.display = 'inline-block';
                    playWebBtn.innerText = '▶ Play (Web)';
                } else {
                    playWebBtn.style.display = 'none';
                }
            }
        }
        nextBtn.innerText = isLast ? 'Mark All Steps Done ✓' : (step.optional ? 'Skip →' : 'Next Step →');
    } else if (step.type === 'recite') {
        inlineRecite.style.display = 'block';
        // Reset recite UI state
        document.getElementById('recitation-result')!.style.display = 'none';
        const reciteBtn = document.getElementById('btn-recite-toggle') as HTMLButtonElement;
        reciteBtn.innerText = '🎙️ Start Reciting';
        reciteBtn.style.background = '';
        reciteBtn.style.color = '';
        nextBtn.innerText = isLast ? 'Mark All Steps Done ✓' : (step.optional ? 'Skip →' : 'Next Step →');
    } else {
        nextBtn.innerText = isLast ? 'Mark All Steps Done ✓' : 'Next Step →';
    }
}

async function reviewVerseAndStamp(reference: string, translation: string) {
    // Build a Day-7 (full-mask) temp verse state with text fetched from API
    let apiUrl: string;
    if (translation === 'esv') {
        apiUrl = `/api/esv?q=${encodeURIComponent(reference)}`;
    } else if (translation === 'niv' || translation === 'nkjv' || translation === 'msg') {
        apiUrl = `/api/bible-version?q=${encodeURIComponent(reference)}&version=${translation}`;
    } else {
        apiUrl = `https://bible-api.com/${encodeURIComponent(reference)}`;
    }
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

document.getElementById('btn-extend-verse')?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!appState?.activeVerse) return;

    const btn = document.getElementById('btn-extend-verse') as HTMLButtonElement;
    const oldText = btn.innerText;
    btn.innerText = 'Extending...';
    btn.disabled = true;

    try {
        const ref = appState.activeVerse.reference.trim();
        const match = ref.match(/^(.*?)\s+(\d+):(\d+)(?:-(\d+))?$/);
        if (!match) {
            console.error("Could not parse reference for extension:", ref);
            return;
        }

        const book = match[1].trim();
        const chapter = match[2];
        const startVerse = match[3];
        const endVerse = match[4] || startVerse;

        const nextVerseNum = parseInt(endVerse, 10) + 1;
        const newRef = `${book} ${chapter}:${startVerse}-${nextVerseNum}`;

        const preferredTranslation = appState.preferredTranslation ?? 'esv';

        async function tryFetch(translation: string): Promise<{ data: any; translation: string }> {
            let apiUrl: string;
            if (translation === 'esv') {
                apiUrl = `/api/esv?q=${encodeURIComponent(newRef)}`;
            } else if (translation === 'niv' || translation === 'nkjv' || translation === 'msg') {
                apiUrl = `/api/bible-version?q=${encodeURIComponent(newRef)}&version=${translation}`;
            } else {
                apiUrl = `https://bible-api.com/${encodeURIComponent(newRef)}`;
            }
            const res = await fetch(apiUrl);
            if (!res.ok) throw new Error(`${translation} fetch failed: ${res.status}`);
            const data = await res.json();
            return { data, translation };
        }

        let result: { data: any; translation: string };
        try {
            result = await tryFetch((appState.activeVerse as any).translation || preferredTranslation);
        } catch {
            result = await tryFetch('web');
        }

        const { data, translation } = result;

        // Update the active verse while keeping the startedDate, but reset the day
        appState.activeVerse.reference = data.reference || newRef;
        appState.activeVerse.text = data.text.trim();
        appState.activeVerse.day = 1;
        appState.activeVerse.lastPracticed = null;
        (appState.activeVerse as any).translation = translation;
        appState.activeVerse.completed = false;
        
        await saveState(appState);
        renderHomeView();
    } catch (err) {
        console.error("Could not extend verse.", err);
        // Instead of an alert, we log it to prevent any browser popup flicker UI issues
    } finally {
        btn.innerText = oldText;
        btn.disabled = false;
    }
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
        let apiUrl: string;
        if (translation === 'esv') {
            apiUrl = `/api/esv?q=${encodeURIComponent(reference)}`;
        } else if (translation === 'niv' || translation === 'nkjv' || translation === 'msg') {
            apiUrl = `/api/bible-version?q=${encodeURIComponent(reference)}&version=${translation}`;
        } else {
            // WEB (internal fallback)
            apiUrl = `https://bible-api.com/${encodeURIComponent(reference)}`;
        }
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
            // API endpoint unavailable (e.g. Vite dev mode without wrangler) — silently retry with WEB
            result = await tryFetch('web');
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
    if (transSelect) appState.preferredTranslation = transSelect.value as 'esv' | 'niv' | 'nkjv' | 'msg' | 'web';
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

// --- Voice Event Listeners ---

// Home view: ▶ Listen button
document.getElementById('btn-home-audio')?.addEventListener('click', (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    const trans = ((appState?.activeVerse as any)?.translation || 'esv') as string;
    if (activeAudio || window.speechSynthesis?.speaking) {
        stopAudio();
        btn.innerText = audioSourceLabel(trans);
        return;
    }
    const verse = appState?.activeVerse;
    if (!verse) return;
    playAudio(verse.text || '', verse.reference, trans, btn);
});

document.getElementById('btn-home-audio-web')?.addEventListener('click', (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    if (activeAudio || window.speechSynthesis?.speaking) {
        stopAudio();
        btn.innerText = '▶ Listen (Web)';
        return;
    }
    const verse = appState?.activeVerse;
    if (!verse) return;
    playLocalSpeech(verse.text || '', btn);
});

// Practice view: ▶ Listen button
document.getElementById('btn-practice-audio')?.addEventListener('click', (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    const trans = ((appState?.activeVerse as any)?.translation || 'esv') as string;
    if (activeAudio || window.speechSynthesis?.speaking) {
        stopAudio();
        btn.innerText = audioSourceLabel(trans);
        return;
    }
    const verse = appState?.activeVerse;
    if (!verse) return;
    playAudio(verse.text || '', verse.reference, trans, btn);
});

document.getElementById('btn-practice-audio-web')?.addEventListener('click', (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    if (activeAudio || window.speechSynthesis?.speaking) {
        stopAudio();
        btn.innerText = '▶ Listen (Web)';
        return;
    }
    const verse = appState?.activeVerse;
    if (!verse) return;
    playLocalSpeech(verse.text || '', btn);
});

// Practice view: Start / Stop Reciting
document.getElementById('btn-recite-toggle')?.addEventListener('click', (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    if (isRecording) {
        stopRecitation(btn);
    } else {
        startRecitation(btn);
    }
});

// Practice view: Try Again (recitation)
document.getElementById('btn-recite-again')?.addEventListener('click', () => {
    document.getElementById('recitation-result')!.style.display = 'none';
    const toggleBtn = document.getElementById('btn-recite-toggle') as HTMLButtonElement;
    startRecitation(toggleBtn);
});

// Step flow: inline ▶ Play button (audio steps)
document.getElementById('btn-step-play')?.addEventListener('click', (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    const trans = ((appState?.activeVerse as any)?.translation || 'esv') as string;
    if (activeAudio || window.speechSynthesis?.speaking) {
        stopAudio();
        btn.innerText = audioSourceLabel(trans, 'Play');
        return;
    }
    const verse = appState?.activeVerse;
    if (!verse) return;
    playAudio(verse.text || '', verse.reference, trans, btn);
});

document.getElementById('btn-step-play-web')?.addEventListener('click', (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    if (activeAudio || window.speechSynthesis?.speaking) {
        stopAudio();
        btn.innerText = '▶ Play (Web)';
        return;
    }
    const verse = appState?.activeVerse;
    if (!verse) return;
    playLocalSpeech(verse.text || '', btn);
});

// Start the app
init();
