import type { VerseState } from './storage';

export function getMaskedText(state: VerseState): string {
  const textToMask = state.text || '';
  const words = textToMask.split(/(\s+)/); // Preserve whitespace
  
  // Day 1-2: 0% masked (Familiarization)
  // Day 3-4: 40% masked (Partial Recall)
  // Day 5-6: 80% masked (Advanced Recall)
  // Day 7+: 100% masked (Full Recall / Only first letters)
  
  let maskPercentage = 0;
  let showFirstLetterDay7 = false;

  if (state.day >= 3 && state.day <= 4) {
    maskPercentage = 0.4;
  } else if (state.day >= 5 && state.day <= 6) {
    maskPercentage = 0.8;
  } else if (state.day >= 7) {
    maskPercentage = 1.0;
    showFirstLetterDay7 = true;
  }

  if (maskPercentage === 0) return textToMask;

  const maskedWords = words.map(word => {
    // Only mask actual words (ignore pure whitespace/punctuation for masking logic)
    if (!word.trim() || !word.match(/[a-zA-Z]/)) return word;

    // Randomly decide to mask based on percentage, UNLESS it's day 7 (100% mask)
    const shouldMask = maskPercentage === 1.0 || Math.random() < maskPercentage;

    if (shouldMask) {
      if (showFirstLetterDay7) {
        // Keep first alphanumeric character, asterisk out the rest
        const firstCharMatch = word.match(/[a-zA-Z]/);
        if (firstCharMatch) {
            const idx = word.indexOf(firstCharMatch[0]);
            const pre = word.substring(0, idx + 1);
            const post = word.substring(idx + 1).replace(/[a-zA-Z]/g, '*');
            return pre + post;
        }
      }
      
      // Standard mask: replace all letters with asterisks
      return word.replace(/[a-zA-Z]/g, '*');
    }
    return word;
  });

  return maskedWords.join('');
}

export function canPracticeToday(state: VerseState): boolean {
  if (!state.lastPracticed) return true;
  
  const lastDate = new Date(state.lastPracticed);
  const today = new Date();
  
  // They can practice if the day has changed
  return lastDate.toDateString() !== today.toDateString();
}

/**
 * Returns memorized verses that are due for a spaced-repetition review today.
 * Schedule (from background.md):
 *   < 30 days since completion  → review every day
 *   30–365 days since completion → review every 7 days
 *   > 365 days since completion  → review every 30 days
 *
 * The interval resets from lastReviewedDate (if set), otherwise from completedDate.
 */
export function getReviewDueVerses(memorizedVerses: VerseState[]): VerseState[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return memorizedVerses.filter(verse => {
    if (!verse.completedDate) return false;

    const completed = new Date(verse.completedDate);
    completed.setHours(0, 0, 0, 0);

    const daysSinceCompletion = Math.floor((today.getTime() - completed.getTime()) / (1000 * 60 * 60 * 24));

    // Determine the required interval in days
    let intervalDays: number;
    if (daysSinceCompletion < 30) {
      intervalDays = 1;   // daily for first month
    } else if (daysSinceCompletion < 365) {
      intervalDays = 7;   // weekly for first year
    } else {
      intervalDays = 30;  // monthly thereafter
    }

    // Check from the last review date (or completed date if never reviewed)
    const baseline = verse.lastReviewedDate
      ? new Date(verse.lastReviewedDate)
      : new Date(verse.completedDate);
    baseline.setHours(0, 0, 0, 0);

    const daysSinceBaseline = Math.floor((today.getTime() - baseline.getTime()) / (1000 * 60 * 60 * 24));
    return daysSinceBaseline >= intervalDays;
  });
}
