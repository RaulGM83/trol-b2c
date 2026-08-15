import { redirect } from 'next/navigation';
export default function P({ searchParams }: { searchParams: { q?: string } }) { redirect(searchParams.q ? `/trabajo?q=${encodeURIComponent(searchParams.q)}` : '/trabajo'); }
