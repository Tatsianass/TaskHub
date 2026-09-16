import type { QuadrantId } from '@/types/task';

export type Quadrant = {
  id: QuadrantId;
  titleKey: string;
  subtitleKey: string;
  icon: string;
  color: string;
};

export const QUADRANTS: Quadrant[] = [
  {
    id: 'urgent-important',
    titleKey: 'quadrant.urgentImportant.title',
    subtitleKey: 'quadrant.urgentImportant.subtitle',
    icon: '🔥',
    color: '#E3A8A8',
  },
  {
    id: 'not-urgent-important',
    titleKey: 'quadrant.notUrgentImportant.title',
    subtitleKey: 'quadrant.notUrgentImportant.subtitle',
    icon: '📅',
    color: '#A8D0B4',
  },
  {
    id: 'urgent-not-important',
    titleKey: 'quadrant.urgentNotImportant.title',
    subtitleKey: 'quadrant.urgentNotImportant.subtitle',
    icon: '⚡',
    color: '#E8CB8E',
  },
  {
    id: 'not-urgent-not-important',
    titleKey: 'quadrant.notUrgentNotImportant.title',
    subtitleKey: 'quadrant.notUrgentNotImportant.subtitle',
    icon: '📥',
    color: '#A8C4E0',
  },
];
