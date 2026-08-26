import type { APIRoute } from 'astro';
import { eventsResponse } from '../../lib/feed/events';

export const prerender = false;

export const GET: APIRoute = ({ locals }) =>
  eventsResponse(locals.runtime?.env.PUBLIC_FEED);
