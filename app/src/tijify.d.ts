export {};

declare global {
  interface Window {
    tijify: {
      tap: (key: string) => Promise<void>;
      hold: (key: string) => Promise<void>;
      release: (key: string) => Promise<void>;
      releaseAll: () => Promise<void>;
    };
  }
}
