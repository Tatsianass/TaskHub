import type { TagId } from '@/types/task';

export type Tag = {
  id: TagId;
  labelKey: string;
  icon: string;
};

export const TAGS: Tag[] = [
  { id: 'work', labelKey: 'tag.work', icon: '💼' },
  { id: 'home', labelKey: 'tag.home', icon: '🏠' },
];
