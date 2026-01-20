export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-anthracite-50">
      {children}
    </div>
  )
}
