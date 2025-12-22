import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  const response = await fetch('https://jsonplaceholder.typicode.com/posts/1');
  const post = await response.json();

  return new Response(
    JSON.stringify({
      message: 'Hello from API',
      fetchedPost: post,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
};
