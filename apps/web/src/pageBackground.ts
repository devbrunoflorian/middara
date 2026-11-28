export function pageBackgroundUrl(pageNumber: number, language: string, sourceUrl: string): string {
  return pageNumber === 101 && language === 'pt-BR'
    ? '/pages/page_101/background-pt-BR.webp'
    : sourceUrl;
}
