export type Birthday = {
  id: string;
  name: string;
  date: string; // 'YYYY-MM-DD'
  remindMe: boolean;
  remindTime: string | null; // 'HH:mm' on the birthday itself
};
