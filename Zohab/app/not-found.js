import Link from 'next/link'

export const metadata = { title: 'Not found' }

export default function NotFound() {
  return (
    <div className="scroll center-fill">
      <div className="glass center">
        <div className="big-emoji">🎲</div>
        <b>This page does not exist</b>
        <div className="gap16" />
        <Link href="/" className="btn gold">
          <span>Back Home</span>
        </Link>
      </div>
    </div>
  )
}
