export const onRequestGet = async (context: any) => {
  const url = new URL(context.request.url);
  const q = url.searchParams.get("q");

  if (!q) {
    return new Response(JSON.stringify({ error: "Missing query" }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
    });
  }

  const apiKey = context.env.ESV_API_KEY;
  if (!apiKey) {
     return new Response(JSON.stringify({ error: "ESV API key not configured" }), { 
         status: 500,
         headers: { "Content-Type": "application/json" }
     });
  }

  try {
    const esvUrl = `https://api.esv.org/v3/passage/text/?q=${encodeURIComponent(q)}&include-passage-references=false&include-footnotes=false&include-headings=false&include-short-copyright=false&include-selahs=false`;
    const response = await fetch(esvUrl, {
      headers: {
        'Authorization': `Token ${apiKey}`
      }
    });

    if (!response.ok) {
        return new Response(JSON.stringify({ error: "ESV API Error", status: response.status }), { 
            status: 502,
            headers: { "Content-Type": "application/json" }
        });
    }

    const data = await response.json() as any;
    
    if (data.passages && data.passages.length > 0) {
        return new Response(JSON.stringify({
            reference: data.canonical,
            text: data.passages[0].trim()
        }), {
            headers: { "Content-Type": "application/json" }
        });
    } else {
        return new Response(JSON.stringify({ error: "No passages found" }), { 
            status: 404,
            headers: { "Content-Type": "application/json" }
        });
    }
  } catch (e) {
      return new Response(JSON.stringify({ error: "Server Error" }), { 
          status: 500,
          headers: { "Content-Type": "application/json" }
      });
  }
};
