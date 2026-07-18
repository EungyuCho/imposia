export class ImposiaError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ImposiaError";
    this.code = code;
  }
}
