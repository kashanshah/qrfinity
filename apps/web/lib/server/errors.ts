/** A user-facing failure with a plain-language message. */
export class ServiceError extends Error {
  constructor(
    message: string,
    readonly code: 'invalid' | 'not_found' | 'rate_limited' | 'forbidden',
  ) {
    super(message)
  }
}
