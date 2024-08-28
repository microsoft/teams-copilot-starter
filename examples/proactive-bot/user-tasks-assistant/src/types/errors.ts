export class FileTooLargeError extends Error {
  constructor(m: string) {
    super(m);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, FileTooLargeError.prototype);
  }
}

export class TooManyPagesError extends Error {
  constructor(m: string) {
    super(m);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, TooManyPagesError.prototype);
  }
}
