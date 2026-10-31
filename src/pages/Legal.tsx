export default function Legal({ kind }: { kind: 'policies' | 'privacy' }) {
  return <main className="p-4">{kind}</main>
}
