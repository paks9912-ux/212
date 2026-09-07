/* Freelancer.com: официальный REST API. Поиск активных проектов открыт; токен расширяет данные о клиенте. */
import type { Source, SourceContext } from './base.js';
import { getJson } from './base.js';
import type { RawItem } from '../types.js';

/* Ответ API упрощён до полей, которые мы используем; лишнее игнорируется */
export interface FlProject {
  id: number; title: string; preview_description?: string; description?: string; seo_url?: string;
  submitdate?: number; time_submitted?: number; type?: string;
  budget?: { minimum?: number; maximum?: number };
  currency?: { code?: string };
  bid_stats?: { bid_count?: number; bid_avg?: number };
  jobs?: Array<{ name: string }>;
  owner_id?: number;
}
interface FlResponse { status: string; result?: { projects?: FlProject[]; users?: Record<string, FlUser> } }
interface FlUser {
  username?: string; display_name?: string; location?: { country?: { name?: string } };
  status?: { payment_verified?: boolean; email_verified?: boolean };
  employer_reputation?: { entire_history?: { overall?: number; reviews?: number; complete?: number } };
  registration_date?: number;
}

export function itemsFromResponse(r: FlResponse): RawItem[] {
  const users = r.result?.users || {};
  return (r.result?.projects || []).map(p => {
    const u = p.owner_id != null ? users[String(p.owner_id)] : undefined;
    const rep = u?.employer_reputation?.entire_history;
    const ts = p.time_submitted ?? p.submitdate;
    return {
      source: 'freelancer' as const, externalId: String(p.id),
      url: p.seo_url ? `https://www.freelancer.com/projects/${p.seo_url}` : `https://www.freelancer.com/projects/${p.id}`,
      title: p.title, text: (p.description || p.preview_description || '').trim(),
      postedAt: ts ? new Date(ts * 1000).toISOString() : null,
      budgetMin: p.budget?.minimum ?? null, budgetMax: p.budget?.maximum ?? null,
      currency: p.currency?.code ?? null, budgetType: p.type === 'hourly' ? 'hourly' : 'fixed',
      proposals: p.bid_stats?.bid_count ?? null, skills: (p.jobs || []).map(j => j.name),
      client: u ? {
        name: u.display_name || u.username || null, country: u.location?.country?.name ?? null,
        verified: u.status?.payment_verified ?? null, rating: rep?.overall ?? null, reviews: rep?.reviews ?? null,
        hires: rep?.complete ?? null, memberSince: u.registration_date ? new Date(u.registration_date * 1000).toISOString() : null,
      } : null,
      raw: { bid_avg: p.bid_stats?.bid_avg },
    };
  });
}

export const freelancer: Source = {
  id: 'freelancer',
  enabled: ctx => ctx.config.sources.freelancer.enabled,
  async fetch(ctx: SourceContext) {
    const headers: Record<string, string> = {};
    if (ctx.config.env.freelancerToken) headers['freelancer-oauth-v1'] = ctx.config.env.freelancerToken;
    const all: RawItem[] = [];
    for (const q of ctx.config.sources.freelancer.queries) {
      const url = `https://www.freelancer.com/api/projects/0.1/projects/active/?query=${encodeURIComponent(q)}` +
        `&limit=${ctx.config.sources.freelancer.limit_per_query}&full_description=true&job_details=true&user_details=true&user_reputation=true&user_status=true&user_country_details=true`;
      const r = await getJson<FlResponse>(ctx.fetch, url, { headers });
      all.push(...itemsFromResponse(r));
    }
    return all;
  },
};
