// `message` is the error code so screens can keep calling t(`errors.${code}`).
export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}
