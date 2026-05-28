import type { AppProps } from "next/app"
import Head from "next/head"
import { Providers } from "../components/providers"
import { installBrowserApi } from "../lib/browser-api"
import "../styles/globals.css"

installBrowserApi()

export default function App({ Component, pageProps }: AppProps) {
  return (
    <Providers>
      <Head>
        <title>Stack PR — Visualize your GitHub PR stacks</title>
      </Head>
      <Component {...pageProps} />
    </Providers>
  )
}
