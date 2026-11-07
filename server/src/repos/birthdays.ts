import type { Queryable } from '../db/connection.js';
import type { Birthday } from '../validation.js';
import { importRow } from './import-ids.js';

type BirthdayRow = {
  id: string;
  name: string;
  date: string;
  remind_me: boolean;
  remind_time: string | null;
  alert_days_before: number | null;
};

const reminderParams = (birthday: Birthday) => [birthday.remindMe, birthday.remindTime, birthday.alertDaysBefore];

const INSERT = `INSERT INTO birthdays (id, user_id, name, date, remind_me, remind_time, alert_days_before)
                VALUES ($1, $2, $3, $4, $5, $6, $7)`;

/**
 * Every statement filters by `user_id`, so a user never sees another user's
 * rows; only the import's owner lookup reads by id alone.
 */
export function birthdaysRepo(db: Queryable) {
  return {
    // Insertion order, like the old local list; the screen sorts by next occurrence.
    async list(userId: string): Promise<Birthday[]> {
      const { rows } = await db.query<BirthdayRow>(
        'SELECT id, name, date, remind_me, remind_time, alert_days_before FROM birthdays WHERE user_id = $1 ORDER BY seq',
        [userId],
      );
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        date: row.date,
        remindMe: row.remind_me,
        remindTime: row.remind_time,
        alertDaysBefore: row.alert_days_before,
      }));
    },

    /**
     * Inserts `birthday` with its client-generated id. Throws the Postgres unique violation
     * (23505, constraint `birthdays_pkey`) if the id already exists.
     */
    async create(userId: string, birthday: Birthday): Promise<Birthday> {
      await db.query(INSERT, [birthday.id, userId, birthday.name, birthday.date, ...reminderParams(birthday)]);
      return birthday;
    },

    /** Same as `tasksRepo().importOne`. Returns true if inserted. */
    importOne(userId: string, birthday: Birthday) {
      return importRow(
        userId,
        birthday.id,
        async (id) => {
          const result = await db.query(`${INSERT} ON CONFLICT (id) DO NOTHING`, [
            id,
            userId,
            birthday.name,
            birthday.date,
            ...reminderParams(birthday),
          ]);
          return (result.rowCount ?? 0) > 0;
        },
        async (id) => {
          const { rows } = await db.query<{ user_id: string }>('SELECT user_id FROM birthdays WHERE id = $1', [id]);
          return rows[0]?.user_id;
        },
      );
    },

    /** Returns the updated birthday, or `undefined` if the user has no birthday `id`. */
    async update(userId: string, id: string, birthday: Birthday): Promise<Birthday | undefined> {
      const result = await db.query(
        `UPDATE birthdays SET name = $1, date = $2, remind_me = $3, remind_time = $4, alert_days_before = $5
         WHERE id = $6 AND user_id = $7`,
        [birthday.name, birthday.date, ...reminderParams(birthday), id, userId],
      );
      return (result.rowCount ?? 0) > 0 ? { ...birthday, id } : undefined;
    },

    /** Returns true if the user's birthday `id` existed and was deleted. */
    async delete(userId: string, id: string) {
      const result = await db.query('DELETE FROM birthdays WHERE id = $1 AND user_id = $2', [id, userId]);
      return (result.rowCount ?? 0) > 0;
    },
  };
}

export type BirthdaysRepo = ReturnType<typeof birthdaysRepo>;
