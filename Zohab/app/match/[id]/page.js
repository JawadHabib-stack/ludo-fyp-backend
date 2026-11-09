import { Suspense } from 'react'
import { Spinner } from '@/components/ui'
import Match from '@/screens/Match'

export const metadata = { title: 'Match' }

// Every screen needs the login saved in this browser, so the server can't pre-render it:
// opt out of Next.js "instant navigation" checks (navigation is still client-side and fast).
export const instant = false

// The match id is only known when the page is opened, so it is read inside <Suspense>.
export default function Page({ params }) {
  return <Suspense fallback={<Spinner />}>{params.then(({ id }) => <Match key={id} id={Number(id)} />)}</Suspense>
}
