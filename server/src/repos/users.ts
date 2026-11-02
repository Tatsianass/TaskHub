import { randomUUID } from 'node:crypto';

import type { StoredPassword } from '../auth/password.js';
import type { Queryable } from '../db/connection.js';

export type User = { id: string; email: string };
export type UserWithPassword = User & { password: StoredPassword };

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  password_params: StoredPassword['params'];
};

export function usersRepo(db: Queryable) {
  return {
    /**
     * Inserts a new user. `email` must already be normalized. Throws the Postgres unique
     * violation (23505, constraint `users_email_key`) if the email is taken.
     */
    async create(email: string, password: StoredPassword): Promise<User> {
      const id = randomUUID();
      await db.query(
        `INSERT INTO users (id, email, password_hash, password_salt, password_params, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, email, password.hash, password.salt, JSON.stringify(password.params), Date.now()],
      );
      return { id, email };
    },

    async findByEmail(email: string): Promise<UserWithPassword | undefined> {
      const { rows } = await db.query<UserRow>(
        `SELECT id, email, password_hash, password_salt, password_params
         FROM users WHERE lower(email) = lower($1)`,
        [email],
      );
      const row = rows[0];
      if (!row) return undefined;
      return {
        id: row.id,
        email: row.email,
        password: { hash: row.password_hash, salt: row.password_salt, params: row.password_params },
      };
    },

    async findByAppleSub(sub: string): Promise<User | undefined> {
      const { rows } = await db.query<User>('SELECT id, email FROM users WHERE apple_sub = $1', [sub]);
      return rows[0];
    },

    /**
     * Inserts a user that signs in with Apple. `password` is a throwaway nobody knows, because the
     * columns are NOT NULL. Throws the unique violation if the email or Apple id is taken.
     */
    async createApple(sub: string, email: string, password: StoredPassword): Promise<User> {
      const id = randomUUID();
      await db.query(
        `INSERT INTO users (id, email, password_hash, password_salt, password_params, created_at, apple_sub)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, email, password.hash, password.salt, JSON.stringify(password.params), Date.now(), sub],
      );
      return { id, email };
    },

    async findById(id: string): Promise<User | undefined> {
      const { rows } = await db.query<User>('SELECT id, email FROM users WHERE id = $1', [id]);
      return rows[0];
    },

    /** Deletes the user; sessions, tasks and birthdays go with it (ON DELETE CASCADE). */
    async delete(id: string) {
      await db.query('DELETE FROM users WHERE id = $1', [id]);
    },
  };
}

export type UsersRepo = ReturnType<typeof usersRepo>;
