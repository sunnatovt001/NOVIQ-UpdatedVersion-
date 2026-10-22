import { SharedSmartPlanner } from './SharedSmartPlanner';
import { useMembership } from '@/src/features/pro/MembershipContext';
export function SmartPlanner({ onLegacy }: { onLegacy: () => void }) {
  const { cinematic } = useMembership();
  return <SharedSmartPlanner onLegacy={onLegacy} referenceAppearance={cinematic} />;
}
