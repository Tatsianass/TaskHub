import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import type { StoredPassword } from '../auth/password.js';

export type User = { id: string; email: string };
export type UserWithPassword = User & { password: StoredPassword };

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  password_params: string;
};

export function usersRepo(db: DatabaseSync) {
  const insert = db.prepare(
    `INSERT INTO users (id, email, password_hash, password_salt, password_params, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const selectByEmail = db.prepare(
    `SELECT id, email, password_hash, password_salt, password_params FROM users WHERE email = ?`,
  );
  const selectById = db.prepare('SELECT id, email FROM users WHERE id = ?');

  return {
    /**
     * Inserts a new user. `email` must already be normalized. Throws the
     * SQLite UNIQUE constraint error (errcode 2067) if the email is taken.
     */
    create(email: string, password: StoredPassword): User {
      const id = randomUUID();
      insert.run(id, email, password.hash, password.salt, JSON.stringify(password.params), Date.now());
      return { id, email };
    },

    findByEmail(email: string): UserWithPassword | undefined {
      const row = selectByEmail.get(email) as UserRow | undefined;
      if (!row) return undefined;
      return {
        id: row.id,
        email: row.email,
        password: {
          hash: row.password_hash,
          salt: row.password_salt,
          params: JSON.parse(row.password_params),
        },
      };
    },

    findById(id: string): User | undefined {
      const row = selectById.get(id) as User | undefined;
      return row && { id: row.id, email: row.email };
    },
  };
}

export type UsersRepo = ReturnType<typeof usersRepo>;
