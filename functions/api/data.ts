import type { PagesFunction } from '@cloudflare/workers-types';

interface Env {
  USER_DATA: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const uid = url.searchParams.get("uid");

  if (!uid) {
    return new Response("Missing UID", { status: 400 });
  }

  const data = await context.env.USER_DATA.get(uid);
  
  if (!data) {
    return new Response(JSON.stringify({ error: "Not found" }), { 
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response(data, {
    headers: { "Content-Type": "application/json" }
  });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const data = await context.request.json() as any;
    
    if (!data || !data.uid) {
      return new Response("Invalid JSON or missing UID", { status: 400 });
    }

    await context.env.USER_DATA.put(data.uid, JSON.stringify(data));
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response("Bad Request", { status: 400 });
  }
};
