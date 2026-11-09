import Profile from '@/screens/Profile'

export const metadata = { title: 'Profile' }

// Every screen needs the login saved in this browser, so the server can't pre-render it:
// opt out of Next.js "instant navigation" checks (navigation is still client-side and fast).
export const instant = false

export default function Page() {
  return <Profile />
}
