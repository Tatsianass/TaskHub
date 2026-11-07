import type { Queryable } from '../db/connection.js';
import type { QuadrantId, RepeatRule, TagId, Task, TaskUpdate } from '../validation.js';
import { importRow } from './import-ids.js';

type TaskRow = {
  id: string;
  title: string;
  description: string;
  quadrant_id: QuadrantId;
  tag: TagId | null;
  done: boolean;
  completed_at: number | null;
  created_at: number;
  due_date: string | null;
  remind_me: boolean;
  remind_time: string | null;
  remind_offsets: unknown;
  repeat: RepeatRule | null;
};

const COLUMNS =
  'id, title, description, quadrant_id, tag, done, completed_at, created_at, due_date, remind_me, remind_time, remind_offsets, repeat';

function parseOffsets(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number') : [];
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    quadrantId: row.quadrant_id,
    tag: row.tag,
    done: row.done,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    dueDate: row.due_date,
    remindMe: row.remind_me,
    remindTime: row.remind_time,
    remindOffsets: parseOffsets(row.remind_offsets),
    repeat: row.repeat,
  };
}

function toParams(userId: string, id: string, task: Task) {
  return [
    id,
    userId,
    task.title,
    task.description,
    task.quadrantId,
    task.tag,
    task.done,
    task.completedAt,
    task.createdAt,
    task.dueDate,
    task.remindMe,
    task.remindTime,
    // pg would send a JS array as a Postgres array, not JSON.
    JSON.stringify(task.remindOffsets),
    task.repeat,
  ];
}

const INSERT = `INSERT INTO tasks (id, user_id, title, description, quadrant_id, tag, done,
                                   completed_at, created_at, due_date, remind_me, remind_time, remind_offsets, repeat)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`;

/**
 * Every statement filters by `user_id`, so a user never sees another user's
 * rows (R4.2); only the import's owner lookup reads by id alone.
 */
export function tasksRepo(db: Queryable) {
  return {
    /** The user's tasks, newest first. */
    async list(userId: string): Promise<Task[]> {
      const { rows } = await db.query<TaskRow>(
        `SELECT ${COLUMNS} FROM tasks WHERE user_id = $1 ORDER BY created_at DESC, seq DESC`,
        [userId],
      );
      return rows.map(toTask);
    },

    /**
     * Inserts `task` with its client-generated id. Throws the Postgres unique violation
     * (23505, constraint `tasks_pkey`) if the id already exists.
     */
    async create(userId: string, task: Task): Promise<Task> {
      await db.query(INSERT, toParams(userId, task.id, task));
      return task;
    },

    /**
     * Inserts `task` for `/import`: skipped if the user already has its id; if
     * another user has it, stored under `remappedId`. Returns true if inserted.
     */
    importOne(userId: string, task: Task) {
      return importRow(
        userId,
        task.id,
        async (id) => {
          const result = await db.query(`${INSERT} ON CONFLICT (id) DO NOTHING`, toParams(userId, id, task));
          return (result.rowCount ?? 0) > 0;
        },
        async (id) => {
          const { rows } = await db.query<{ user_id: string }>('SELECT user_id FROM tasks WHERE id = $1', [id]);
          return rows[0]?.user_id;
        },
      );
    },

    /** Returns the updated task, or `undefined` if the user has no task `id`. */
    async update(userId: string, id: string, fields: TaskUpdate): Promise<Task | undefined> {
      const { rows } = await db.query<TaskRow>(
        `UPDATE tasks
         SET title = $1, description = $2, quadrant_id = $3, tag = $4, done = $5, completed_at = $6,
             due_date = $7, remind_me = $8, remind_time = $9, remind_offsets = $10, repeat = $11
         WHERE id = $12 AND user_id = $13
         RETURNING ${COLUMNS}`,
        [
          fields.title,
          fields.description,
          fields.quadrantId,
          fields.tag,
          fields.done,
          fields.completedAt,
          fields.dueDate,
          fields.remindMe,
          fields.remindTime,
          JSON.stringify(fields.remindOffsets),
          fields.repeat,
          id,
          userId,
        ],
      );
      return rows[0] && toTask(rows[0]);
    },

    /** Returns true if the user's task `id` existed and was deleted. */
    async delete(userId: string, id: string) {
      const result = await db.query('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [id, userId]);
      return (result.rowCount ?? 0) > 0;
    },
  };
}

export type TasksRepo = ReturnType<typeof tasksRepo>;
