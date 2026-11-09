import { Roboto } from 'next/font/google'
import AppShell from '@/components/AppShell'
import './globals.css'

const roboto = Roboto({ subsets: ['latin'], variable: '--font-roboto' })

export const metadata = {
  title: { default: 'Ludo Arena', template: '%s · Ludo Arena' },
  description: 'Online multiplayer Ludo: play vs computer, online, in private rooms and in knockout tournaments.',
}

export const viewport = {
  themeColor: '#0B1026',
  viewportFit: 'cover',
}

// Every page is drawn inside the app card by AppShell (it also handles login).
export default function RootLayout({ children }) {
  return (
    <html lang="en" className={roboto.variable}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
