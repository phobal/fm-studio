import { getToday } from '../../../lib/podcasts.mjs';
export async function GET() {
  return Response.json(await getToday(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
