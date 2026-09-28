import type { DatabaseSync } from 'node:sqlite';

import type { Birthday } from '../validation.js';
import { importRow } from './import-ids.js';

/**
 * Every statement filters by `user_id`, so a user never sees another user's
 * rows; only the import's owner lookup reads by id alone.
 */
export function birthdaysRepo(db: DatabaseSync) {
  // Insertion order, like the old local list; the screen sorts by next occurrence.
  const selectAll = db.prepare('SELECT id, name, date FROM birthdays WHERE user_id = ? ORDER BY rowid');
  const INSERT = 'INSERT INTO birthdays (id, user_id, name, date) VALUES (?, ?, ?, ?)';
  const insert = db.prepare(INSERT);
  const insertOrSkip = db.prepare(`${INSERT} ON CONFLICT(id) DO NOTHING`);
  const selectOwner = db.prepare('SELECT user_id FROM birthdays WHERE id = ?');
  const remove = db.prepare('DELETE FROM birthdays WHERE id = ? AND user_id = ?');

  return {
    list(userId: string): Birthday[] {
      return (selectAll.all(userId) as Birthday[]).map(({ id, name, date }) => ({ id, name, date }));
    },

    /**
     * Inserts `birthday` with its client-generated id. Throws the SQLite
     * PRIMARY KEY constraint error (errcode 1555) if the id already exists.
     */
    create(userId: string, birthday: Birthday): Birthday {
      insert.run(birthday.id, userId, birthday.name, birthday.date);
      return birthday;
    },

    /** Same as `tasksRepo().importOne`. Returns true if inserted. */
    importOne(userId: string, birthday: Birthday) {
      return importRow(
        userId,
        birthday.id,
        (id) => insertOrSkip.run(id, userId, birthday.name, birthday.date).changes > 0,
        (id) => (selectOwner.get(id) as { user_id: string } | undefined)?.user_id,
      );
    },

    /** Returns true if the user's birthday `id` existed and was deleted. */
    delete(userId: string, id: string) {
      return remove.run(id, userId).changes > 0;
    },
  };
}

export type BirthdaysRepo = ReturnType<typeof birthdaysRepo>;
