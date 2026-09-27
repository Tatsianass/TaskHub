import type { DatabaseSync } from 'node:sqlite';

import type { QuadrantId, TagId, Task, TaskUpdate } from '../validation.js';

type TaskRow = {
  id: string;
  title: string;
  description: string;
  quadrant_id: QuadrantId;
  tag: TagId | null;
  done: 0 | 1;
  created_at: number;
  due_date: string | null;
  remind_me: 0 | 1;
  remind_time: string | null;
};

const COLUMNS =
  'id, title, description, quadrant_id, tag, done, created_at, due_date, remind_me, remind_time';

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    quadrantId: row.quadrant_id,
    tag: row.tag,
    done: row.done === 1,
    createdAt: row.created_at,
    dueDate: row.due_date,
    remindMe: row.remind_me === 1,
    remindTime: row.remind_time,
  };
}

/** Every statement filters by `user_id`: a user never sees another user's rows (R4.2). */
export function tasksRepo(db: DatabaseSync) {
  const selectAll = db.prepare(
    `SELECT ${COLUMNS} FROM tasks WHERE user_id = ? ORDER BY created_at DESC, rowid DESC`,
  );
  const insert = db.prepare(
    `INSERT INTO tasks (id, user_id, title, description, quadrant_id, tag, done, created_at,
                        due_date, remind_me, remind_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const update = db.prepare(
    `UPDATE tasks
     SET title = ?, description = ?, quadrant_id = ?, tag = ?, done = ?, due_date = ?,
         remind_me = ?, remind_time = ?
     WHERE id = ? AND user_id = ?
     RETURNING ${COLUMNS}`,
  );
  const remove = db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?');

  return {
    /** The user's tasks, newest first. */
    list(userId: string): Task[] {
      return (selectAll.all(userId) as TaskRow[]).map(toTask);
    },

    /**
     * Inserts `task` with its client-generated id. Throws the SQLite PRIMARY
     * KEY constraint error (errcode 1555) if the id already exists.
     */
    create(userId: string, task: Task): Task {
      insert.run(
        task.id,
        userId,
        task.title,
        task.description,
        task.quadrantId,
        task.tag,
        task.done ? 1 : 0,
        task.createdAt,
        task.dueDate,
        task.remindMe ? 1 : 0,
        task.remindTime,
      );
      return task;
    },

    /** Returns the updated task, or `undefined` if the user has no task `id`. */
    update(userId: string, id: string, fields: TaskUpdate): Task | undefined {
      const row = update.get(
        fields.title,
        fields.description,
        fields.quadrantId,
        fields.tag,
        fields.done ? 1 : 0,
        fields.dueDate,
        fields.remindMe ? 1 : 0,
        fields.remindTime,
        id,
        userId,
      ) as TaskRow | undefined;
      return row && toTask(row);
    },

    /** Returns true if the user's task `id` existed and was deleted. */
    delete(userId: string, id: string) {
      return remove.run(id, userId).changes > 0;
    },
  };
}

export type TasksRepo = ReturnType<typeof tasksRepo>;
