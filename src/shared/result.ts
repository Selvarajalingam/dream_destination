export type AppError = {
  code: string;
  message: string;
  status: number;
  detail?: string;
  actions?: string[];
};

export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly actions?: string[],
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
