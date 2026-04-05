export const onRequestGet = async (context: any) => {
  const url = new URL(context.request.url);
  const q = url.searchParams.get('q');

  if (!q) {
    return new Response(JSON.stringify({ error: 'Missing query' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = context.env.ESV_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ESV API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const esvAudioUrl = `https://api.esv.org/v3/passage/audio/?q=${encodeURIComponent(q)}`;
    // ESV returns a redirect to the actual MP3. We follow it and stream the audio back.
    const response = await fetch(esvAudioUrl, {
      headers: {
        Authorization: `Token ${apiKey}`,
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'ESV Audio API Error', status: response.status }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Stream the MP3 body back to the browser
    return new Response(response.body, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        // Allow the browser to cache this for the session, but no long-term caching
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
