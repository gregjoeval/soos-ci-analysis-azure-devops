export class Logger {
  private _verbose: boolean;
  private _console: Console;

  constructor(verbose: boolean = false, console: Console = global.console) {
    this._verbose = verbose;
    this._console = console;
  }

  group(message?: any, ...optionalParams: any[]): void {
    this._console.group(message, ...optionalParams);
  }

  groupEnd(): void {
    this._console.groupEnd();
  }

  logVerbose(message?: any, ...optionalParams: any[]): void {
    if (this._verbose) {
      this._console.info(message, ...optionalParams);
    }
  }

  log(message?: any, ...optionalParams: any[]): void {
    this._console.info(message, ...optionalParams);
  }

  warn(message?: any, ...optionalParams: any[]): void {
    this._console.warn(message, ...optionalParams);
  }

  error(message?: any, ...optionalParams: any[]): void {
    this._console.error(message, ...optionalParams);
  }
}
