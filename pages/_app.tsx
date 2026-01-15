import type { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <style jsx global>{`
        * {
          box-sizing: border-box;
        }
        html,
        body {
          margin: 0;
          padding: 0;
        }
      `}</style>
      <Component {...pageProps} />
    </>
  );
}
