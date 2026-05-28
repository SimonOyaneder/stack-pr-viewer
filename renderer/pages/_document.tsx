import { Head, Html, Main, NextScript } from "next/document"

export default function Document() {
  return (
    <Html lang="en" suppressHydrationWarning>
      <Head>
        <meta
          name="description"
          content="Visualize authored GitHub pull requests as an interactive dependency tree with auto-layout."
        />
      </Head>
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
