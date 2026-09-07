/* Общие типы конвейера */

export type SourceId = 'freelancer' | 'telegram' | 'hn' | 'reddit' | 'manual';
export type Platform = 'freelancer' | 'upwork' | 'kwork' | 'fl' | 'telegram' | 'hn' | 'reddit' | 'other';

export interface ClientInfo {
  name?: string | null;
  country?: string | null;
  verified?: boolean | null;     // подтверждённая оплата
  rating?: number | null;        // 0..5
  reviews?: number | null;
  hires?: number | null;
  spentUsd?: number | null;
  memberSince?: string | null;
}

/* Что отдаёт адаптер источника — до нормализации */
export interface RawItem {
  source: SourceId;
  externalId: string;
  url: string | null;
  title: string;
  text: string;
  postedAt: string | null;       // ISO
  budgetMin?: number | null;
  budgetMax?: number | null;
  currency?: string | null;
  budgetType?: 'fixed' | 'hourly' | null;
  proposals?: number | null;
  skills?: string[];
  client?: ClientInfo | null;
  platform?: Platform;           // для ручной вставки: с какой площадки
  raw?: unknown;
}

export type OppStatus = 'new' | 'filtered' | 'scored' | 'shown' | 'applied' | 'rejected' | 'later' | 'won' | 'lost' | 'expired';

export interface Opportunity {
  id: string;
  source: SourceId;
  platform: Platform;
  externalId: string;
  url: string | null;
  title: string;
  text: string;
  lang: 'ru' | 'en' | 'other';
  postedAt: string | null;
  fetchedAt: string;
  budgetMin: number | null;
  budgetMax: number | null;
  currency: string | null;
  budgetUsd: number | null;      // середина вилки в долларах, если известна
  budgetType: 'fixed' | 'hourly' | null;
  proposals: number | null;
  skills: string[];
  client: ClientInfo | null;
  status: OppStatus;
  filterReason: string | null;
  dedupKey: string;
}

export interface ScoreFactors {
  fit: number;
  money: number;
  ai_leverage: number;
  client: number;
  speed: number;
  competition: number;
  repeat: number;
  risk: number;
}

/* Что возвращает модель */
export interface LlmScore {
  factors: ScoreFactors;
  est_hours: number;
  budget_usd_estimate: number;
  service_key: string;
  summary: string;
  missing_info: string[];
  red_flags: string[];
  risk_level: 'low' | 'medium' | 'high';
  rationale: string;
}

export type Category = 'HOT' | 'HIGH_PROFIT' | 'QUICK_WIN' | 'HIGH_AI' | 'GOOD_CLIENT' | 'MAYBE' | 'REJECT';

/* Итог: оценка модели плюс наша арифметика */
export interface Scored extends LlmScore {
  opportunityId: string;
  model: string;
  score: number;                 // 0..100
  pWin: number;                  // 0..1
  evHourly: number;              // ожидаемые $/час
  hourlyIfWon: number;           // $/час, если выиграли
  fee: number;
  budgetUsd: number;
  categories: Category[];
  primary: Category;
  show: boolean;                 // показывать ли вам
  costUsd: number;               // сколько стоил этот запрос к модели
  createdAt: string;
}

export interface Proposal {
  variant: 'short' | 'professional' | 'conversion';
  text: string;
}

export type ProjectStatus = 'NEW' | 'NEGOTIATION' | 'WON' | 'IN_PROGRESS' | 'WAITING_CLIENT' | 'QA'
  | 'READY_TO_DELIVER' | 'DELIVERED' | 'COMPLETED' | 'PAID' | 'CANCELLED';
