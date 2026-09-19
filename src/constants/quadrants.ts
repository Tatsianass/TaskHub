import type { QuadrantId } from '@/types/task';

export type Quadrant = {
  id: QuadrantId;
  titleKey: string;
  subtitleKey: string;
  shortLabelKey: string;
  icon: string;
  color: string;
};

/** Soft cap of active (not done) tasks per quadrant before "Swap to Add" kicks in. */
export const MAX_ACTIVE_TASKS_PER_QUADRANT = 3;

export const QUADRANTS: Quadrant[] = [
  {
    id: 'urgent-important',
    titleKey: 'quadrant.urgentImportant.title',
    subtitleKey: 'quadrant.urgentImportant.subtitle',
    shortLabelKey: 'quadrant.urgentImportant.short',
    icon: '🔥',
    color: '#E3A8A8',
  },
  {
    id: 'not-urgent-important',
    titleKey: 'quadrant.notUrgentImportant.title',
    subtitleKey: 'quadrant.notUrgentImportant.subtitle',
    shortLabelKey: 'quadrant.notUrgentImportant.short',
    icon: '📅',
    color: '#A8D0B4',
  },
  {
    id: 'urgent-not-important',
    titleKey: 'quadrant.urgentNotImportant.title',
    subtitleKey: 'quadrant.urgentNotImportant.subtitle',
    shortLabelKey: 'quadrant.urgentNotImportant.short',
    icon: '⚡',
    color: '#E8CB8E',
  },
  {
    id: 'not-urgent-not-important',
    titleKey: 'quadrant.notUrgentNotImportant.title',
    subtitleKey: 'quadrant.notUrgentNotImportant.subtitle',
    shortLabelKey: 'quadrant.notUrgentNotImportant.short',
    icon: '📥',
    color: '#A8C4E0',
  },
];
