import type { UniversityBook, Profile } from '../types';
export const universityBooks: UniversityBook[] = [1,2,3,4].map((year) => ({id: 'year-'+year, title: ['大学一年','大学二年','大学三年','大学四年'][year-1], pages: []}));
export function readUniversityBooks(copy?: Profile['pageCopy']): UniversityBook[] {
  return universityBooks.map(book => ({...book, pages: copy?.universityBooks?.find(item => item.id === book.id)?.pages || []}));
}
