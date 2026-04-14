export const onRequestGet = async (context: any) => {
  const url = new URL(context.request.url);
  const text = url.searchParams.get('text');

  if (!text) {
    return new Response(JSON.stringify({ error: 'Missing text query parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = context.env.GOOGLETTS_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Google TTS API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const ttsResponse = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: { text },
        voice: {
          languageCode: 'en-US',
          name: 'en-US-Journey-D'
        },
        audioConfig: {
          audioEncoding: 'MP3'
        }
      })
    });

    if (!ttsResponse.ok) {
      const errorData = await ttsResponse.text();
      return new Response(JSON.stringify({ error: 'Google TTS API Error', details: errorData }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const ttsData: any = await ttsResponse.json();
    const audioBase64 = ttsData.audioContent;

    if (!audioBase64) {
      return new Response(JSON.stringify({ error: 'No audio content in response' }), { status: 500 });
    }

    // Decode base64 to binary buffer
    const binaryString = atob(audioBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return new Response(bytes.buffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: 'Server Error', message: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
