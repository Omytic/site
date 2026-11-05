import Logo from './Logo'

export default function Footer() {
  return (
    <footer className="bg-ink text-white/60">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
        <Logo variant="light" size="sm" />
        <p className="text-sm">
          Toptan kumaş ticareti, FormStep ve SERYN
        </p>
        <p className="text-sm">© {new Date().getFullYear()} OMY Ticaret</p>
      </div>
    </footer>
  )
}
