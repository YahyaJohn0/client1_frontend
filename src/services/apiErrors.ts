export class ApiError extends Error {
  constructor(message: string, public status = 500, public code?: string, public details?: any) {
    super(message);
    this.name = 'ApiError';
  }
}
