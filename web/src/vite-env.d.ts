/// <reference types="vite/client" />

// Static asset imports resolve to a URL string at build time (Vite).
declare module '*.png' {
  const src: string;
  export default src;
}
