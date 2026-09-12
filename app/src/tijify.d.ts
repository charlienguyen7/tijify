export {};

declare global {
  interface Window {
    tijify: {
      tapKey: (keys: string[]) => Promise<void>;
    };
  }
}
