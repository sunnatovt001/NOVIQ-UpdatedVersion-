import type { SmartPlan } from '@/src/features/planner/smartPlannerModel';
import type { PlanRevision } from '@/src/features/planner/plannerCloud';

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/planner/${path}`, { method: body === undefined ? 'GET' : 'PUT',
    credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000),
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw Object.assign(new Error(response.status === 409 ? 'Planner revision changed.' :
    response.status === 401 ? 'Sign in required.' : 'Planner request failed.'), { status: response.status });
  return response.json() as Promise<T>;
}
export const loadMongoPlan = () => request<{ plan: SmartPlan | null }>('plan');
export const loadMongoPlanHistory = () => request<{ revisions: PlanRevision[] }>('history');
export const saveMongoPlan = (plan: SmartPlan, baseRevision: string | null, description: string) =>
  request<{ plan: SmartPlan }>('plan', { plan, baseRevision, description });
