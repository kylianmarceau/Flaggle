declare namespace Bun {
  interface ServerWebSocket<T = unknown> {
    readonly data: T;
    send(message: string): unknown;
    close(code?: number, reason?: string): void;
  }

  interface Server<T = unknown> {
    readonly port: number;
    readonly hostname: string;
    upgrade(request: Request, options?: { readonly data: T }): boolean;
    stop(closeActiveConnections?: boolean): void;
  }

  interface ServeOptions<T = unknown> {
    readonly port?: number;
    readonly hostname?: string;
    readonly fetch: (request: Request, server: Server<T>) => Response | undefined | Promise<Response | undefined>;
    readonly websocket?: {
      readonly open?: (socket: ServerWebSocket<T>) => void;
      readonly message?: (socket: ServerWebSocket<T>, message: string | ArrayBuffer | Uint8Array) => void;
      readonly close?: (socket: ServerWebSocket<T>, code: number, reason: string) => void;
    };
  }

  function serve<T = unknown>(options: ServeOptions<T>): Server<T>;
  function file(path: string): Blob;
}
