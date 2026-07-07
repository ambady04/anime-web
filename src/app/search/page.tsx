import SearchClient from './search-client';

interface PageProps {
  searchParams: Promise<{ q?: string; category?: string }>;
}

export default async function SearchPage({ searchParams }: PageProps) {
  const { q, category } = await searchParams;

  return (
    <div className="min-h-screen">
      <SearchClient initialQuery={q} initialCategory={category} />
    </div>
  );
}
