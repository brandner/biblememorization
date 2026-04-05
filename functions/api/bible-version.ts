/**
 * Cloudflare Pages Function: /api/bible-version
 *
 * Proxies requests to the api.bible API for NIV and MSG translations.
 * Query params:
 *   ?q=<reference>   e.g. "John 3:16"
 *   ?version=<niv|msg>
 *
 * Returns: { reference: string, text: string }
 */

const BIBLE_IDS: Record<string, string> = {
  niv: '78a9f6124f344018-01',
  msg: '6f11a7de016f942e-01',
};

/**
 * Convert a human-readable reference like "John 3:16" or "Philippians 4:6-7"
 * into an api.bible passage ID like "PHP.4.6-PHP.4.7".
 *
 * api.bible uses OSIS book abbreviations and dot-separated chapter/verse notation.
 */
function referenceToPassageId(reference: string): string | null {
  // Book abbreviation map (common names → OSIS)
  const BOOK_MAP: Record<string, string> = {
    'genesis': 'GEN', 'gen': 'GEN',
    'exodus': 'EXO', 'exo': 'EXO', 'ex': 'EXO',
    'leviticus': 'LEV', 'lev': 'LEV',
    'numbers': 'NUM', 'num': 'NUM',
    'deuteronomy': 'DEU', 'deu': 'DEU', 'deut': 'DEU',
    'joshua': 'JOS', 'josh': 'JOS',
    'judges': 'JDG', 'judg': 'JDG',
    'ruth': 'RUT',
    '1 samuel': '1SA', '1sa': '1SA', '1sam': '1SA',
    '2 samuel': '2SA', '2sa': '2SA', '2sam': '2SA',
    '1 kings': '1KI', '1ki': '1KI', '1kgs': '1KI',
    '2 kings': '2KI', '2ki': '2KI', '2kgs': '2KI',
    '1 chronicles': '1CH', '1ch': '1CH', '1chr': '1CH',
    '2 chronicles': '2CH', '2ch': '2CH', '2chr': '2CH',
    'ezra': 'EZR',
    'nehemiah': 'NEH', 'neh': 'NEH',
    'esther': 'EST', 'est': 'EST',
    'job': 'JOB',
    'psalms': 'PSA', 'psalm': 'PSA', 'ps': 'PSA', 'psa': 'PSA',
    'proverbs': 'PRO', 'prov': 'PRO', 'pro': 'PRO',
    'ecclesiastes': 'ECC', 'eccl': 'ECC', 'ecc': 'ECC',
    'song of solomon': 'SNG', 'song of songs': 'SNG', 'song': 'SNG', 'sng': 'SNG',
    'isaiah': 'ISA', 'isa': 'ISA',
    'jeremiah': 'JER', 'jer': 'JER',
    'lamentations': 'LAM', 'lam': 'LAM',
    'ezekiel': 'EZK', 'ezek': 'EZK', 'ezk': 'EZK',
    'daniel': 'DAN', 'dan': 'DAN',
    'hosea': 'HOS', 'hos': 'HOS',
    'joel': 'JOL', 'jol': 'JOL',
    'amos': 'AMO', 'amo': 'AMO',
    'obadiah': 'OBA', 'oba': 'OBA',
    'jonah': 'JON', 'jon': 'JON',
    'micah': 'MIC', 'mic': 'MIC',
    'nahum': 'NAM', 'nam': 'NAM',
    'habakkuk': 'HAB', 'hab': 'HAB',
    'zephaniah': 'ZEP', 'zep': 'ZEP',
    'haggai': 'HAG', 'hag': 'HAG',
    'zechariah': 'ZEC', 'zech': 'ZEC', 'zec': 'ZEC',
    'malachi': 'MAL', 'mal': 'MAL',
    'matthew': 'MAT', 'matt': 'MAT', 'mat': 'MAT',
    'mark': 'MRK', 'mrk': 'MRK',
    'luke': 'LUK', 'luk': 'LUK',
    'john': 'JHN', 'jhn': 'JHN',
    'acts': 'ACT', 'act': 'ACT',
    'romans': 'ROM', 'rom': 'ROM',
    '1 corinthians': '1CO', '1co': '1CO', '1cor': '1CO',
    '2 corinthians': '2CO', '2co': '2CO', '2cor': '2CO',
    'galatians': 'GAL', 'gal': 'GAL',
    'ephesians': 'EPH', 'eph': 'EPH',
    'philippians': 'PHP', 'phil': 'PHP', 'php': 'PHP',
    'colossians': 'COL', 'col': 'COL',
    '1 thessalonians': '1TH', '1th': '1TH', '1thess': '1TH',
    '2 thessalonians': '2TH', '2th': '2TH', '2thess': '2TH',
    '1 timothy': '1TI', '1ti': '1TI', '1tim': '1TI',
    '2 timothy': '2TI', '2ti': '2TI', '2tim': '2TI',
    'titus': 'TIT', 'tit': 'TIT',
    'philemon': 'PHM', 'phm': 'PHM',
    'hebrews': 'HEB', 'heb': 'HEB',
    'james': 'JAS', 'jas': 'JAS',
    '1 peter': '1PE', '1pe': '1PE', '1pet': '1PE',
    '2 peter': '2PE', '2pe': '2PE', '2pet': '2PE',
    '1 john': '1JN', '1jn': '1JN', '1john': '1JN',
    '2 john': '2JN', '2jn': '2JN', '2john': '2JN',
    '3 john': '3JN', '3jn': '3JN', '3john': '3JN',
    'jude': 'JUD', 'jud': 'JUD',
    'revelation': 'REV', 'rev': 'REV',
  };

  // Parse: "Book Chapter" or "Book Chapter:Verse" or "Book Chapter:VerseStart-VerseEnd"
  const match = reference.trim().match(/^(.+?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/i);
  if (!match) return null;

  const bookRaw = match[1].toLowerCase().trim();
  const chapter = match[2];
  const verseStart = match[3];
  const verseEnd = match[4];

  const bookCode = BOOK_MAP[bookRaw];
  if (!bookCode) return null;

  if (!verseStart) {
    return `${bookCode}.${chapter}`;
  }

  const startId = `${bookCode}.${chapter}.${verseStart}`;
  if (verseEnd) {
    const endId = `${bookCode}.${chapter}.${verseEnd}`;
    return `${startId}-${endId}`;
  }
  return startId;
}

export const onRequestGet = async (context: any) => {
  const url = new URL(context.request.url);
  const q = url.searchParams.get('q');
  const version = url.searchParams.get('version');

  if (!q || !version) {
    return new Response(JSON.stringify({ error: 'Missing query or version' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const bibleId = BIBLE_IDS[version.toLowerCase()];
  if (!bibleId) {
    return new Response(JSON.stringify({ error: `Unsupported version: ${version}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = context.env.API_BIBLE_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API Bible key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const passageId = referenceToPassageId(q);
  if (!passageId) {
    return new Response(JSON.stringify({ error: `Could not parse reference: ${q}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const apiUrl = `https://rest.api.bible/v1/bibles/${bibleId}/passages/${encodeURIComponent(passageId)}?content-type=text&include-notes=false&include-titles=false&include-chapter-numbers=false&include-verse-numbers=false&include-verse-spans=false`;

    const response = await fetch(apiUrl, {
      headers: {
        'api-key': apiKey,
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('api.bible error:', response.status, errText);
      return new Response(JSON.stringify({ error: 'api.bible API Error', status: response.status }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json() as any;
    const rawText: string = data?.data?.content ?? '';

    // Clean up the text: strip residual HTML/XML tags and collapse whitespace
    const cleanText = rawText
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const canonicalRef: string = data?.data?.reference ?? q;

    return new Response(JSON.stringify({ reference: canonicalRef, text: cleanText }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
