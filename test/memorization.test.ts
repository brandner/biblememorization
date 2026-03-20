import { describe, it, expect, vi } from 'vitest';
import { getMaskedText, canPracticeToday } from '../src/utils/memorization';
import { VerseState } from '../src/utils/storage';

describe('memorization logic', () => {
    
    const mockVerse: VerseState = {
        reference: "John 11:35",
        text: "Jesus wept.",
        day: 1,
        lastPracticed: null,
        completed: false
    };

    it('should not mask text on days 1-2', () => {
        expect(getMaskedText(mockVerse)).toBe("Jesus wept.");
        expect(getMaskedText({ ...mockVerse, day: 2 })).toBe("Jesus wept.");
    });

    it('should mask roughly 40% on days 3-4', () => {
        // Mock Math.random to always return 0.1 so it ALWAYS masks if threshold > 0
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1);

        const masked = getMaskedText({ ...mockVerse, text: "For God so loved the world", day: 3 });
        expect(masked).not.toBe("For God so loved the world");
        expect(masked).toContain('*');
        
        randomSpy.mockRestore();
    });

    it('should show only first letters on day 7+', () => {
        const masked = getMaskedText({ ...mockVerse, text: "For God so loved", day: 7 });
        expect(masked).toBe("F** G** s* l****");
    });

    it('canPracticeToday should return true if lastPracticed is null', () => {
        expect(canPracticeToday(mockVerse)).toBe(true);
    });

    it('canPracticeToday should return false if lastPracticed is today', () => {
        const todayVerse = { ...mockVerse, lastPracticed: new Date().toISOString() };
        expect(canPracticeToday(todayVerse)).toBe(false);
    });

    it('canPracticeToday should return true if lastPracticed is yesterday', () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const pastVerse = { ...mockVerse, lastPracticed: yesterday.toISOString() };
        expect(canPracticeToday(pastVerse)).toBe(true);
    });

});
