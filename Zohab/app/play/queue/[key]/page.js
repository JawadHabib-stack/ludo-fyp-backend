import { Suspense } from 'react'
import { Spinner } from '@/components/ui'
import { Matchmaking } from '@/screens/Play'

export const metadata = { title: 'Finding players' }

// Every screen needs the login saved in this browser, so the server can't pre-render it:
// opt out of Next.js "instant navigation" checks (navigation is still client-side and fast).
export const instant = false

// The queue key (ffa2, ffa4, 2v2) is only known when the page is opened, so it is read inside <Suspense>.
export default function Page({ params }) {
  return <Suspense fallback={<Spinner />}>{params.then(({ key }) => <Matchmaking key={key} queueKey={key} />)}</Suspense>
}
