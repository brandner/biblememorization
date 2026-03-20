# Roadmap: Voice Verification for Scripture Memorization

## Overview
The goal is to allow users to speak a verse out loud and have the application automatically verify if they successfully memorized it. This requires Speech-to-Text (STT) capabilities and fuzzy string matching.

## Recommended Tech Stack: Cloudflare Workers AI
Since the application is already designed to be hosted on Cloudflare Pages/Functions, the most cost-effective and seamless integration is **Cloudflare Workers AI**.
Cloudflare provides built-in access to automated speech recognition models, specifically OpenAI's **Whisper** model (`@cf/openai/whisper`).

### Why this is the best approach:
- **Cost:** Cloudflare Workers AI has a very generous free tier (10,000 neurons per day for free, and Whisper uses very few neurons per second of audio). Even on paid tiers, it is fractions of a cent per transcription.
- **Simplicity:** It requires no third-party API keys (like Google Cloud or AWS) and runs directly on Cloudflare's edge network, meaning it integrates perfectly with our existing `functions/api/` setup.
- **Privacy:** Audio is processed ephemerally on the edge and not stored in any database.

---

## Implementation Plan

### 1. Frontend Microphone Capture (Low Effort)
*   **Web Audio API:** Use the browser's native `MediaRecorder` API to request microphone access.
*   **UI:** Add a "Hold to Speak" microphone button on the Practice View.
*   **Logic:** When the user releases the button, compile the audio chunks into an audio `Blob` and POST it to our backend.

### 2. Backend Transcription (Low Effort)
*   **Cloudflare Function:** Create a new file (e.g., `functions/api/speech.ts`).
*   **AI Binding:** Bind the Workers AI service to our function in `wrangler.toml`.
*   **Processing:** The function receives the audio blob, passes it to the `@cf/openai/whisper` model, and returns the transcribed text string to the frontend.

### 3. Verification Logic (Medium Effort)
Speech-to-text models are incredibly accurate, but they occasionally struggle with biblical names, punctuation, or numbers (e.g., transcribing "2" instead of "two"). We cannot do a strict `a === b` comparison.
*   **Sanitization:** Strip all punctuation, capitalization, and numbers from both the transcription and the `activeVerse.text`.
*   **Fuzzy Matching:** Implement a string-similarity algorithm (like Levenshtein distance) in JavaScript.
*   **Threshold:** If the similarity score is above a certain threshold (e.g., 85% or 90%), we mark the practice as "Successful". 
*   **Feedback:** Show the user exactly what the AI *thought* they said, and highlight any missing or severely botched words.

---

## Overall Assessment
**Effort Level:** Medium
**Feasibility:** Very High

This is a fantastic and highly feasible roadmap feature. The browser APIs for audio recording are standard and well-supported, Cloudflare makes the AI infrastructure frictionless, and the string comparison can be handled entirely on the lightweight frontend.
